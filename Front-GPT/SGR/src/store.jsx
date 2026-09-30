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
  const [mode, setModeState] = useState(() => read("-mode", "api")),
    [base, setBase] = useState(() =>
      read("-base", import.meta.env.VITE_API_URL || "/api"),
    );
  const [db, setDB] = useState(() =>
      mode === "local" ? { ...emptyDB(), ...read("-local", {}) } : emptyDB(),
    ),
    [status, setStatus] = useState(mode === "api" ? "connecting" : "local"),
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
    toastTimer = useRef(),
    queryRanges = useRef({}),
    requestVersions = useRef({});
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
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const pathFor = (key) => {
    const p = resources[key].path;
    if (key === "feedback" && client.current.doc?.paths?.["/settings/feedback"])
      return "/settings/feedback";
    return p;
  };
  async function refresh(key, params = {}) {
    if (modeRef.current !== "api") return;
    queryRanges.current[key] = { ...queryRanges.current[key], ...params };
    if (!client.current.doc) return;
    const token = generation.current;
    const version = (requestVersions.current[key] || 0) + 1;
    requestVersions.current[key] = version;
    try {
      const range = {
        ...(["eventos", "registros"].includes(key)
          ? {
              fecha_desde: addDays(today(), -370),
              fecha_hasta: addDays(today(), 370),
              desde: addDays(today(), -370),
              hasta: addDays(today(), 370),
            }
          : {}),
        ...queryRanges.current[key],
      };
      let rows = await client.current.list(pathFor(key), range);
      if (["fireFilas", "inflacion"].includes(key))
        rows = rows.map((row) => ({ ...row, id: row.id ?? row.mes }));
      if (
        token !== generation.current ||
        requestVersions.current[key] !== version
      )
        return;
      setDB((prev) => {
        const next = { ...prev, [key]: rows };
        dbRef.current = next;
        return next;
      });
      setErrors((e) => ({ ...e, [key]: null }));
    } catch (e) {
      if (
        token === generation.current &&
        requestVersions.current[key] === version
      )
        setErrors((prev) => ({ ...prev, [key]: e.message }));
    }
  }
  async function connect() {
    setStatus("connecting");
    setErrors({});
    setDB(emptyDB());
    const token = ++generation.current;
    try {
      client.current = new Client(base);
      await client.current.connect();
      if (token !== generation.current) return;
      setStatus("online");
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
  function saveRoute(key, item = {}) {
    const basePath = pathFor(key);
    let path = item.id ? itemPath(key, item) : basePath;
    if (
      !item.id &&
      client.current.doc &&
      !["POST", "PUT"].some((method) =>
        client.current.operation(basePath, method),
      )
    ) {
      const template = Object.keys(client.current.doc.paths).find(
        (p) =>
          p.startsWith(basePath + "/") &&
          /^\{[^}]+\}\/?$/.test(p.slice(basePath.length + 1)) &&
          client.current.operation(p, "PUT"),
      );
      if (template)
        path = template.replace(/\{([^}]+)\}/g, (_, param) =>
          item[param] != null ? encodeURIComponent(item[param]) : `{${param}}`,
        );
    }
    return {
      path,
      method: client.current.method(
        path,
        item.id ? ["PATCH", "PUT"] : ["POST", "PUT"],
      ),
    };
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
        const target = saveRoute(key, payload);
        const path =
          action === "record"
            ? `/habitos/${encodeURIComponent(payload.habito_id)}/registro`
            : action === "delete"
              ? itemPath(key, payload)
              : target.path;
        const method =
          action === "delete"
            ? "DELETE"
            : action === "record"
              ? "PUT"
              : target.method;
        const body = { ...payload };
        delete body.id;
        delete body.creado_en;
        delete body.actualizado_en;
        if (action === "record") delete body.habito_id;
        for (const param of client.current.operation(path, method)
          ?.parameters || [])
          if (param.in === "path") delete body[param.name];
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
    if (modeRef.current !== "local")
      throw Error("Los ejemplos solo están disponibles en el espacio local.");
    if (Object.keys(resources).some((k) => (dbRef.current[k] || []).length))
      throw Error(
        "Los ejemplos solo se pueden cargar en un espacio local vacío.",
      );
    persist(sampleDB());
    notify("Ejemplos cargados en tu espacio local");
  };
  const importLocal = (value) => {
    if (modeRef.current !== "local")
      throw Error(
        "La restauración JSON solo está disponible en el espacio local.",
      );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("El archivo no contiene un espacio SGR válido.");
    for (const key of Object.keys(resources)) {
      if (!Array.isArray(value[key])) throw Error(`Falta la colección ${key}.`);
      if (
        value[key].some(
          (row) =>
            !row ||
            typeof row !== "object" ||
            Array.isArray(row) ||
            row.id == null,
        )
      )
        throw Error(`La colección ${key} contiene un elemento inválido.`);
    }
    for (const key of ["config", "settings"])
      if (
        value[key] &&
        (typeof value[key] !== "object" || Array.isArray(value[key]))
      )
        throw Error(`El campo ${key} no es válido.`);
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
        saveRoute,
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
