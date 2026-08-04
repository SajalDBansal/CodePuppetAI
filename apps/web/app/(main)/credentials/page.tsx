import { getProviders } from "@/lib/catalog"
import { getCredentials } from "@/lib/credentials"
import { CredentialsClient } from "./credentials-client"

export default async function CredentialsPage() {
    const [credentials, providers] = await Promise.all([getCredentials(), getProviders()])

    return <CredentialsClient initialCredentials={credentials} providers={providers} />
}
