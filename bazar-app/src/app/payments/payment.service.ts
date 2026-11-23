import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type PaymentType = 'full' | 'deposit';

export interface CheckoutLink {
  orderNsu: string;
  checkoutUrl: string;
  amount: number;
}

export interface PaymentConfirmation {
  status: 'pending' | 'paid';
  productSlug: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);

  createCheckout(slug: string, paymentType: PaymentType, phone: string): Observable<CheckoutLink> {
    return this.http.post<CheckoutLink>('/api/checkout', { slug, paymentType, phone });
  }

  confirmPayment(
    orderNsu: string,
    transactionNsu: string,
    invoiceSlug: string
  ): Observable<PaymentConfirmation> {
    return this.http.post<PaymentConfirmation>('/api/payments/confirm', {
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      invoice_slug: invoiceSlug,
    });
  }
}
