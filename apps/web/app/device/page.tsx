import { getApiBaseUrl } from "@/lib/api"
import { DeviceApproval } from "./device-approval"

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>
}) {
  const query = await searchParams
  const initialCode = Array.isArray(query.user_code) ? query.user_code[0] : query.user_code

  return <DeviceApproval apiBaseUrl={getApiBaseUrl()} initialCode={initialCode ?? ""} />
}
