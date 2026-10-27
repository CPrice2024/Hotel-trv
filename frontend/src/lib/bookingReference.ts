export function formatBookingReference(id: string): string {
  return /^[a-f\d]{24}$/i.test(id) ? `AD-${id.slice(-10).toUpperCase()}` : id;
}
