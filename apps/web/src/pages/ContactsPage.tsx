import { ContactsList } from '../features/contacts/components/ContactsList';

export function ContactsPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <ContactsList />
      </div>
    </div>
  );
}
