import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReservationService } from '../reservations/reservation.service';
import { PRODUCTS, Product } from '../products/product-data';
import { PaymentService, PaymentType } from '../payments/payment.service';
import {
  createReservationWhatsAppUrl,
  WHATSAPP_REDIRECT,
} from './whatsapp-redirect';

@Component({
  selector: 'app-product-detail',
  templateUrl: './product-detail.page.html',
  styleUrls: ['./product-detail.page.scss'],
  standalone: false,
})
export class ProductDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly reservationService = inject(ReservationService);
  private readonly paymentService = inject(PaymentService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly redirectToWhatsApp = inject(WHATSAPP_REDIRECT);
  readonly product: Product | undefined;
  activeImageIndex = 0;
  isReserved: boolean | null = null;
  reservationLoadFailed = false;
  checkoutInProgress: PaymentType | null = null;
  checkoutErrorMessage: string | null = null;

  constructor() {
    const slug = this.route.snapshot.paramMap.get('slug');
    this.product = PRODUCTS.find((item) => item.slug === slug);

    const product = this.product;
    if (product) {
      this.reservationService.getStatus(product.slug).subscribe({
        next: (status) => {
          this.isReserved = status.reserved;
          this.changeDetector.markForCheck();
        },
        error: () => {
          this.reservationLoadFailed = true;
          this.changeDetector.markForCheck();
          this.redirectToWhatsApp(createReservationWhatsAppUrl(product, 'availability'));
        },
      });
    }
  }

  showPreviousImage(): void {
    if (this.activeImageIndex > 0) {
      this.activeImageIndex -= 1;
    }
  }

  showNextImage(): void {
    if (this.product && this.activeImageIndex < this.product.images.length - 1) {
      this.activeImageIndex += 1;
    }
  }

  selectImage(index: number): void {
    if (this.product && index >= 0 && index < this.product.images.length) {
      this.activeImageIndex = index;
    }
  }

  startCheckout(paymentType: PaymentType): void {
    const product = this.product;
    if (!product || this.isReserved !== false || this.checkoutInProgress) {
      return;
    }

    this.checkoutInProgress = paymentType;
    this.checkoutErrorMessage = null;
    this.paymentService.createCheckout(product.slug, paymentType).subscribe({
      next: (checkout) => window.location.assign(checkout.checkoutUrl),
      error: (error: unknown) => {
        this.checkoutInProgress = null;
        if (error instanceof HttpErrorResponse && error.status === 409) {
          this.checkoutErrorMessage =
            'Já existe um checkout em andamento para este item. Retome a opção escolhida ou fale com a loja para alterar o pagamento.';
        } else if (error instanceof HttpErrorResponse && error.status === 503) {
          this.checkoutErrorMessage = 'O checkout ainda não está configurado. Fale com a loja.';
        } else {
          this.checkoutErrorMessage = 'Não foi possível iniciar o checkout. Tente novamente mais tarde.';
        }
        this.redirectToWhatsApp(createReservationWhatsAppUrl(product, 'checkout'));
      },
    });
  }

  get depositAmount(): number {
    return this.product ? Math.round(this.product.price * 30) / 100 : 0;
  }
}
