import { APIClient } from "../api-client.js";
import { AuthStore } from "./auth-store.js";
import { CatalogStore } from "./catalog-store.js";
import { ConfigStore } from "./config-store.js";
import { HarnessPath } from "./path.js";

export class Harness {
    readonly paths: HarnessPath
    readonly api: APIClient
    readonly auth: AuthStore
    readonly catalog: CatalogStore
    readonly config: ConfigStore

    constructor(apiUrl: string) {
        this.paths = new HarnessPath();
        this.auth = new AuthStore(this.paths);
        this.catalog = new CatalogStore(this.paths);
        this.config = new ConfigStore(this.paths);
        this.api = new APIClient({
            baseUrl: apiUrl,
            getAccessToken: () => this.auth.getAccessToken()
        })
    }
}