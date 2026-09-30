import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Client, unpack } from "./api.js";
import { emptyDB, localMutation, sampleDB } from "./local.js";
import { resources } from "./resources.js";
import { today, addDays, download } from "./domain.js";
const Context = createContext(null),
  PREFIX = "sgr-orbita-v1";
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function Provider({ children }) {
  const [mode, setModeState] = useState(() => read("-mode", "local")),
    [base, setBase] = useState(() =>
      read("-base", import.meta.env.VITE_API_URL || "/api"),
    );
  const [db, setDB] = useState(() => ({ ...emptyDB(), ...read("-local", {}) })),
    [status, setStatus] = useState("local"),
    [errors, setErrors] = useState({}),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [preferences, setPrefs] = useState(() =>
      read("-prefs", {
        theme: "dark",
        motion: true,
        name: "",
        notifications: false,
        lead: 15,
      }),
    );
  const client = useRef(new Client(base)),
    dbRef = useRef(db),
    modeRef = useRef(mode),
    generation = useRef(0),
    toastTimer = useRef();
  dbRef.current = db;
  modeRef.current = mode;
  const notify = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  };
  const persist = (value) => {
    localStorage.setItem(PREFIX + "-local", JSON.stringify(value));
    dbRef.current = value;
    setDB(value);
  };
  const pathFor = (key) => {
    const p = resources[key].path;
    if (key === "feedback" && client.current.doc?.paths?.["/settings/feedback"])
      return "/settings/feedback";
    return p;
  };
  async function refresh(key, params = {}) {
    if (modeRef.current !== "api") return;
    const token = generation.current;
    try {
      const range = {
        fecha_desde: addDays(today(), -370),
        fecha_hasta: addDays(today(), 370),
        desde: addDays(today(), -370),
        hasta: addDays(today(), 370),
        ...params,
      };
      const rows = await client.current.list(pathFor(key), range);
      if (token !== generation.current) return;
      setDB((prev) => {
        const next = { ...prev, [key]: rows };
        dbRef.current = next;
        return next;
      });
      setErrors((e) => ({ ...e, [key]: null }));
    } catch (e) {
      if (token === generation.current)
        setErrors((prev) => ({ ...prev, [key]: e.message }));
    }
  }
  async function connect() {
    setStatus("connecting");
    setErrors({});
    const token = ++generation.current;
    try {
      client.current = new Client(base);
      await client.current.connect();
      if (token !== generation.current) return;
      setStatus("online");
      setDB(emptyDB());
      await Promise.all(Object.keys(resources).map((key) => refresh(key)));
      for (const [key, path] of [
        ["config", "/fin/config"],
        ["settings", "/settings"],
      ]) {
        try {
          if (!client.current.operation(path, "GET")) continue;
          const data = await client.current.request(path);
          if (token === generation.current)
            setDB((prev) => ({ ...prev, [key]: data }));
        } catch (e) {
          setErrors((prev) => ({ ...prev, [key]: e.message }));
        }
      }
    } catch (e) {
      if (token === generation.current) {
        setStatus("offline");
        setErrors({ connection: e.message });
      }
    }
  }
  useEffect(() => {
    localStorage.setItem(PREFIX + "-mode", JSON.stringify(mode));
    localStorage.setItem(PREFIX + "-base", JSON.stringify(base));
    if (mode === "api") connect();
    else {
      generation.current++;
      setStatus("local");
      setErrors({});
      setDB({ ...emptyDB(), ...read("-local", {}) });
    }
    return () => {
      generation.current++;
    };
  }, [mode, base]);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.motion = preferences.motion ? "on" : "off";
    localStorage.setItem(PREFIX + "-prefs", JSON.stringify(preferences));
  }, [preferences]);
  function itemPath(key, item) {
    const path = pathFor(key);
    const template = Object.keys(client.current.doc?.paths || {}).find(
      (p) =>
        p.startsWith(path + "/") &&
        /^\{[^}]+\}\/?$/.test(p.slice(path.length + 1)),
    );
    if (template)
      return template.replace(/\{([^}]+)\}/g, (_, param) =>
        encodeURIComponent(
          item[param] ?? (param === "mes" ? item.mes : item.id),
        ),
      );
    return path + "/" + encodeURIComponent(item.id ?? item.mes);
  }
  async function mutate(key, action, payload) {
    try {
      let result;
      if (modeRef.current === "local") {
        const next = localMutation(dbRef.current, key, action, payload);
        persist(next.db);
        result = next.row;
      } else {
        if (status !== "online")
          throw Error(
            "Conectá la API antes de guardar. Tus datos no se guardaron.",
          );
        const path =
          action === "record"
            ? `/habitos/${encodeURIComponent(payload.habito_id)}/registro`
            : payload.id || action === "delete"
              ? itemPath(key, payload)
              : pathFor(key);
        const method =
          action === "delete"
            ? "DELETE"
            : action === "record"
              ? "PUT"
              : payload.id
                ? client.current.method(path, ["PATCH", "PUT"])
                : client.current.method(path, ["POST", "PUT"]);
        const body = { ...payload };
        delete body.id;
        delete body.creado_en;
        delete body.actualizado_en;
        if (action === "record") delete body.habito_id;
        result = await client.current.save(
          path,
          method,
          action === "delete" ? undefined : body,
        );
        await refresh(key);
        if (["movimientos", "transacciones", "objetivos"].includes(key))
          await Promise.all(
            ["cuentas", "instrumentos", "finCategorias"].map((k) => refresh(k)),
          );
      }
      notify(
        action === "delete"
          ? "Eliminado correctamente"
          : action === "record"
            ? "Progreso registrado"
            : "Guardado correctamente",
      );
      return result;
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  async function configSave(key, value) {
    try {
      if (modeRef.current === "local")
        persist({ ...dbRef.current, [key]: value });
      else {
        const path = key === "config" ? "/fin/config" : "/settings";
        await client.current.save(
          path,
          client.current.method(path, ["PUT", "PATCH"]),
          value,
        );
        setDB((d) => ({ ...d, [key]: value }));
      }
      notify("Preferencias guardadas");
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  async function action(path, method = "GET", body, filename) {
    try {
      if (modeRef.current !== "api")
        throw Error("Esta función requiere conexión con la API de SGR.");
      const value = await client.current.request(
        path,
        method,
        body,
        filename ? { blob: true } : {},
      );
      if (filename) download(value, filename);
      else notify("Operación completada");
      return value;
    } catch (e) {
      notify(e.message, "error");
      throw e;
    }
  }
  const setMode = (value) => {
    setModal(null);
    setModeState(value);
  };
  const seed = () => {
    if (Object.keys(resources).some((k) => (dbRef.current[k] || []).length))
      throw Error(
        "Los ejemplos solo se pueden cargar en un espacio local vacío.",
      );
    persist(sampleDB());
    notify("Ejemplos cargados en tu espacio local");
  };
  const importLocal = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("El archivo no contiene un espacio SGR válido.");
    for (const key of Object.keys(resources))
      if (!Array.isArray(value[key])) throw Error(`Falta la colección ${key}.`);
    persist({ ...emptyDB(), ...value });
    notify("Espacio local restaurado");
  };
  return (
    <Context.Provider
      value={{
        db,
        mode,
        setMode,
        base,
        setBase,
        status,
        errors,
        refresh,
        connect,
        mutate,
        action,
        configSave,
        client: client.current,
        pathFor,
        itemPath,
        notify,
        toast,
        setToast,
        modal,
        setModal,
        preferences,
        setPrefs,
        seed,
        importLocal,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
