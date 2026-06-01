import { getContacts } from '@/actions/contacts'
import ContactsClient from '@/components/contacts/ContactsClient'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const { contacts, totalCount } = await getContacts(1, 100)

  return (
    <ContactsClient
      initialContacts={contacts as any}
      initialTotal={totalCount}
    />
  )
}
