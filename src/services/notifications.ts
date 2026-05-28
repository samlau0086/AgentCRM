export type NotificationType = "success" | "error" | "warning" | "info";

export type AppNotification = {
  id: string;
  title?: string;
  message: string;
  type: NotificationType;
};

export function notify(
  message: string,
  type: NotificationType = "info",
  title?: string,
) {
  window.dispatchEvent(
    new CustomEvent<AppNotification>("crm:notify", {
      detail: {
        id: `notification_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        title,
        message,
        type,
      },
    }),
  );
}
