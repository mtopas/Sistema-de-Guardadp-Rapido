import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/syne/latin-400.css";
import "@fontsource/syne/latin-500.css";
import "@fontsource/syne/latin-600.css";
import "@fontsource/syne/latin-700.css";
import "@fontsource/syne/latin-800.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import { Provider } from "./store";
import App from "./App";
import "./styles.css";
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal-error">
          <h1>Necesitamos volver a conectar.</h1>
          <p>
            Se produjo un error al mostrar el espacio. Tus datos guardados
            siguen en su lugar.
          </p>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>
            Volver a cargar
          </button>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <Provider>
      <App />
    </Provider>
  </ErrorBoundary>,
);
