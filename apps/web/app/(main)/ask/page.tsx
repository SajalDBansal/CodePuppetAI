import { getProviders } from "@/lib/catalog"
import { getCredentials } from "@/lib/credentials"
import { AskNewPane } from "@/components/app/ask-new-pane"

export default async function AskPage() {
    const [providers, credentials] = await Promise.all([getProviders(), getCredentials()])

    return <AskNewPane providers={providers} credentials={credentials} />
}
