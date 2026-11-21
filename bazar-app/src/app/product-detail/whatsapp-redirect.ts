import { InjectionToken } from '@angular/core';
import { Product } from '../products/product-data';

export type WhatsAppRedirectReason = 'availability' | 'checkout';

export const WHATSAPP_REDIRECT = new InjectionToken<(url: string) => void>(
  'WHATSAPP_REDIRECT',
  {
    providedIn: 'root',
    factory: () => (url: string) => window.location.assign(url),
  }
);

export function createReservationWhatsAppUrl(
  product: Product,
  reason: WhatsAppRedirectReason
): string {
  const action = reason === 'availability'
    ? 'ao verificar a disponibilidade'
    : 'durante o checkout';
  const message =
    `Olá! Deu erro no site ${action} do item ${product.name} (código: ${product.slug}). ` +
    'Quero reservar esse item.';

  return `https://wa.me/5547992626735?text=${encodeURIComponent(message)}`;
}
