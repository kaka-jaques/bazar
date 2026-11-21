import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentService } from '../payments/payment.service';

@Component({
  selector: 'app-payment-return',
  templateUrl: './payment-return.page.html',
  styleUrls: ['./payment-return.page.scss'],
  standalone: false,
})
export class PaymentReturnPage {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentService = inject(PaymentService);

  isChecking = true;
  paymentStatus: 'pending' | 'paid' | null = null;
  productSlug: string | null = null;
  verificationFailed = false;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const orderNsu = params.get('order_nsu');
    const transactionNsu = params.get('transaction_nsu');
    const invoiceSlug = params.get('slug');

    if (!orderNsu || !transactionNsu || !invoiceSlug) {
      this.isChecking = false;
      this.verificationFailed = true;
      return;
    }

    this.paymentService.confirmPayment(orderNsu, transactionNsu, invoiceSlug).subscribe({
      next: (result) => {
        this.paymentStatus = result.status;
        this.productSlug = result.productSlug;
        this.isChecking = false;
      },
      error: () => {
        this.isChecking = false;
        this.verificationFailed = true;
      },
    });
  }
}
