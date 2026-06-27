import { AuthStore, CatalogStore, ConfigStore, Path, VaultStore } from "@workspace/harness";
import { harnessConfig } from "./config.js";

export const path = new Path();
export const configStore = new ConfigStore(harnessConfig.BACKEND_URL);
export const catalogStore = new CatalogStore(harnessConfig.BACKEND_URL);
export const authStore = new AuthStore(harnessConfig.BACKEND_URL);
export const vaultStore = new VaultStore(harnessConfig.BACKEND_URL);
