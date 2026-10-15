import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { dialog } from "./utils/dialog";
import { initializeLocale } from "./i18n";

async function start() {
  await initializeLocale();
  createApp(App).directive("dialog", dialog).mount("#app");
}
void start();
