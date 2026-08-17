import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./i18n/index.js";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { LanguageProvider } from "./context/LanguageContext.jsx";
import { StoreProvider } from "./context/StoreContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { CurrencyProvider } from "./context/CurrencyContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <CurrencyProvider>
              <StoreProvider>
                <App />
              </StoreProvider>
            </CurrencyProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
