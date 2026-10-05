import { useEffect, useState } from 'react'
import { MapPin, Plus, Search, Store, UserRound } from 'lucide-react'
import api from '../api/axiosInstance'
import ClientForm from './ClientForm'

function contactName(client) {
  return `${client.first_name} ${client.last_name}`
}

function ClientManager({ isManager, user }) {
  const [clients, setClients] = useState([])
  const [clientQuery, setClientQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const filteredClients = clients.filter((client) => {
    const query = clientQuery.trim().toLowerCase()
    if (!query) return true
    return [client.shop_name, client.first_name, client.last_name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  })

  useEffect(() => {
    const controller = new AbortController()
    api.get('/clients', { signal: controller.signal })
      .then((response) => {
        setClients(response.data.clients)
        setError('')
      })
      .catch((requestError) => {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Unable to load clients.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  function refreshClients() {
    setShowCreateForm(false)
    setSelectedClient(null)
    setLoading(true)
    setRefreshKey((current) => current + 1)
  }

  return (
    <section aria-labelledby="clients-title" className="mt-7 rounded-lg border border-[#dce4dd] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6ece7] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Store aria-hidden="true" className="text-[#527264]" size={18} />
          <div>
            <h2 className="text-base font-bold text-[#172b28]" id="clients-title">Clients</h2>
            <p className="mt-1 text-xs text-[#829087]">{filteredClients.length} of {clients.length} client{clients.length === 1 ? '' : 's'} · {isManager ? 'All assigned accounts' : `Managed by ${user?.username ?? 'you'}`}</p>
          </div>
        </div>
        <button aria-expanded={showCreateForm} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#cbd6ce] bg-white px-3 text-xs font-bold text-[#354941] transition hover:border-[#a9c0af] hover:bg-[#f4f8f4]" onClick={() => setShowCreateForm((shown) => !shown)} type="button">
          <Plus aria-hidden="true" size={15} /> Create client
        </button>
      </div>

      {showCreateForm && <div className="expand-down border-b border-[#e6ece7] bg-[#f8faf7]">
        <div className="min-h-0 overflow-hidden p-5 sm:p-6">
        <div className="mb-5">
          <p className="font-mono text-[10px] text-[#7f8c84]">NEW CLIENT</p>
          <h3 className="mt-1 text-base font-bold text-[#172b28]">Client details</h3>
        </div>
        <ClientForm isManager={isManager} onCancel={() => setShowCreateForm(false)} onSaved={refreshClients} />
        </div>
      </div>}

      <div className="border-b border-[#e6ece7] px-4 py-3 sm:px-6">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#829087]" size={16} />
          <input aria-label="Search clients by shop or contact name" className="min-h-10 w-full rounded-md border border-[#dce4dd] bg-white pl-9 pr-3 text-sm text-[#273b35] outline-none transition focus:border-[#1e5144] focus:ring-2 focus:ring-[#1e5144]/15" onChange={(event) => setClientQuery(event.target.value)} placeholder="Search shop, first name, or last name" type="search" value={clientQuery} />
        </label>
      </div>

      {error && <p className="m-5 rounded-md border border-[#edc9c0] bg-[#fff0eb] px-4 py-3 text-sm text-[#a34435]" role="alert">{error}</p>}
      {loading && <p className="px-5 py-8 text-center text-sm text-[#829087]" role="status">Loading clients…</p>}
      {!loading && filteredClients.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#f8faf7] text-[11px] uppercase text-[#7b8981]">
            <tr>
              <th className="px-5 py-3 font-semibold sm:px-6">Shop name</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Sales agent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e6ece7]">
            {filteredClients.map((client) => (
              <tr key={client.id}>
                <th className="px-5 py-3.5 font-semibold text-[#354941] sm:px-6">
                  <div className="flex items-center gap-3">
                    {client.shop_photo_path
                      ? <img alt="" className="h-9 w-9 rounded-md border border-[#dce4dd] object-cover" src={`/uploads/client-shops/${encodeURIComponent(client.shop_photo_path)}`} />
                      : <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-md bg-[#edf3ee] text-[#527264]"><Store size={16} /></span>}
                    <div className="min-w-0">
                      <button className="block text-left underline decoration-[#b5c8ba] underline-offset-4 hover:text-[#1e5144]" onClick={() => setSelectedClient(client)} type="button">{client.shop_name}</button>
                      <span className="mt-0.5 block text-[11px] font-normal text-[#829087]">{contactName(client)}</span>
                    </div>
                  </div>
                </th>
                <td className="px-4 py-3.5 text-[#64736b]">{client.phone_number}</td>
                <td className="max-w-64 truncate px-4 py-3.5 text-[#64736b]" title={client.address}>{client.address}</td>
                <td className="px-4 py-3.5 text-[#64736b]">{client.location || '—'}</td>
                <td className="px-4 py-3.5 text-[#64736b]">{client.agent_first_name ? `${client.agent_first_name} ${client.agent_last_name}` : client.agent_username || 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}

      {!loading && clients.length > 0 && filteredClients.length === 0 && <div className="px-5 py-8 text-center">
        <h3 className="text-sm font-bold text-[#354941]">No matching clients</h3>
        <p className="mt-1 text-xs text-[#829087]">Try a shop name or part of the client&apos;s name.</p>
        <button className="mt-3 text-xs font-bold text-[#1e5144] underline underline-offset-4" onClick={() => setClientQuery('')} type="button">Clear search</button>
      </div>}

      {!loading && clients.length === 0 && <div className="grid min-h-40 place-items-center px-5 py-8 text-center">
        <div>
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-[#edf3ee] text-[#527264]"><UserRound aria-hidden="true" size={19} /></span>
          <h3 className="mt-3 text-sm font-bold text-[#354941]">No clients yet</h3>
          <p className="mt-1 text-xs text-[#829087]">Create a client profile to start organizing your accounts.</p>
        </div>
      </div>}

      {selectedClient && <div className="fixed inset-0 z-50 grid place-items-center bg-[#172b28]/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedClient(null) }}>
          <section aria-labelledby="client-dialog-title" aria-modal="true" className="dialog-enter max-h-[92svh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#dce4dd] bg-[#f8faf7] shadow-[0_20px_70px_rgba(23,43,40,0.24)]" role="dialog">
          <div className="border-b border-[#e1e8e2] px-5 py-4 sm:px-7">
            <p className="font-mono text-[10px] text-[#7f8c84]">CLIENT PROFILE</p>
            <h2 className="mt-1 text-lg font-bold text-[#172b28]" id="client-dialog-title">Edit {selectedClient.shop_name}</h2>
            <p className="mt-1 text-xs text-[#829087]">Contact: {contactName(selectedClient)}</p>
            {selectedClient.location && <p className="mt-1 flex items-center gap-1.5 text-xs text-[#829087]"><MapPin aria-hidden="true" size={13} />{selectedClient.location}</p>}
          </div>
          <div className="p-5 sm:p-7">
            <ClientForm client={selectedClient} isManager={isManager} onCancel={() => setSelectedClient(null)} onSaved={refreshClients} />
          </div>
        </section>
      </div>}
    </section>
  )
}

export default ClientManager