import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentService } from '../payments/payment.service';
import { PRODUCTS } from '../products/product-data';

@Component({
  selector: 'app-payment-return',
  templateUrl: './payment-return.page.html',
  styleUrls: ['./payment-return.page.scss'],
  standalone: false,
})
export class PaymentReturnPage {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentService = inject(PaymentService);
  private readonly changeDetector = inject(ChangeDetectorRef);

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
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.isChecking = false;
        this.verificationFailed = true;
        this.changeDetector.markForCheck();
      },
    });
  }

  get productName(): string {
    return PRODUCTS.find((product) => product.slug === this.productSlug)?.name ?? 'seu item';
  }
}
