import { getApiBaseUrl } from "./api"

export type CatalogModel = {
  providerId: string
  modelId: string
  displayName: string
  contextWindow: number
  maxOutputTokens: number
}

export type CatalogProvider = {
  providerId: string
  displayName: string
  isDefault: boolean
  models: CatalogModel[]
}

/** Public catalog data — no auth required. */
export async function getProviders(): Promise<CatalogProvider[]> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/catalog/providers`, {
      next: { revalidate: 300 },
    })
    if (!response.ok) return []
    const body = (await response.json()) as { providers: CatalogProvider[] }
    return body.providers
  } catch {
    return []
  }
}
