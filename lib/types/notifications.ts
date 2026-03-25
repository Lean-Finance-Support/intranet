export interface Notification {
  id: string;
  recipient_id: string;
  company_id: string | null;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
