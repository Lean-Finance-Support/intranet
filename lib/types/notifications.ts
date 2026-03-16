export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}
