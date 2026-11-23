/** Open WhatsApp with a ready-to-send message. The teacher picks the chat and presses send. */
export function whatsappLink(text: string, phone?: string) {
  // A local Nigerian number like 0803 123 4567 becomes 2348031234567.
  const digits = (phone ?? '').replace(/[^\d]/g, '').replace(/^0(?=\d{10}$)/, '234');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
