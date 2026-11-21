import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { of, Subject, throwError } from 'rxjs';
import { ReservationService, ReservationStatus } from '../reservations/reservation.service';
import { PaymentService } from '../payments/payment.service';
import { ProductDetailPage } from './product-detail.page';
import { WHATSAPP_REDIRECT } from './whatsapp-redirect';

async function createPage(
  slug: string,
  getStatus: () => ReturnType<ReservationService['getStatus']> = () => of({ slug, reserved: false }),
  createCheckout: () => ReturnType<PaymentService['createCheckout']> = () =>
    of({ orderNsu: 'order-1', checkoutUrl: 'https://checkout.infinitepay.com.br/test', amount: 1 }),
  redirectToWhatsApp: (url: string) => void = () => undefined
): Promise<ComponentFixture<ProductDetailPage>> {
  await TestBed.configureTestingModule({
    declarations: [ProductDetailPage],
    imports: [CommonModule, IonicModule.forRoot(), RouterModule.forRoot([])],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ slug }) } },
      },
      {
        provide: ReservationService,
        useValue: { getStatus },
      },
      {
        provide: PaymentService,
        useValue: { createCheckout },
      },
      {
        provide: WHATSAPP_REDIRECT,
        useValue: redirectToWhatsApp,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProductDetailPage);
  fixture.detectChanges();
  return fixture;
}

describe('ProductDetailPage', () => {
  it('shows details for a matching product slug', async () => {
    const fixture = await createPage('poltrona-nuvem');

    expect(fixture.nativeElement.textContent).toContain('Poltrona Nuvem');
    expect(fixture.nativeElement.textContent).toContain('Madeira maciça e tecido bouclé');
    expect(fixture.nativeElement.querySelectorAll('.gallery-thumbnail').length).toBe(2);
  });

  it('moves through the product gallery using its controls', async () => {
    const fixture = await createPage('poltrona-nuvem');
    const nextButton: HTMLButtonElement = fixture.nativeElement.querySelector('.gallery-arrow.next');

    nextButton.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.gallery-counter').textContent.trim()).toBe('2 / 2');
    expect(fixture.nativeElement.querySelector('.detail-image img').getAttribute('src'))
      .toContain('poltrona-nuvem-detalhe.svg');
  });

  it('keeps checkout buttons visible but disabled until availability is confirmed', async () => {
    const status = new Subject<ReservationStatus>();
    const fixture = await createPage('poltrona-nuvem', () => status);
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.checkout-button');

    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).every((button) => button.disabled)).toBe(true);
    expect(fixture.nativeElement.querySelector('.availability').textContent)
      .toContain('Verificando disponibilidade');

    status.next({ slug: 'poltrona-nuvem', reserved: false });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.isReserved).toBe(false);
    expect(fixture.componentInstance.reservationLoadFailed).toBe(false);
    expect(fixture.componentInstance.checkoutInProgress).toBeNull();
    const availableButtons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.checkout-button');
    expect(Array.from(availableButtons).map((button) => button.disabled)).toEqual([false, false]);
    expect(fixture.nativeElement.querySelector('.availability').textContent)
      .toContain('Disponível no acervo');
  });

  it('shows the item as reserved when the API reports it', async () => {
    const fixture = await createPage('poltrona-nuvem', () =>
      of({ slug: 'poltrona-nuvem', reserved: true })
    );

    expect(fixture.nativeElement.querySelector('.availability').textContent).toContain('Item reservado');
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.checkout-button');
    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).every((button) => button.disabled)).toBe(true);
  });

  it('offers full payment or a 30% deposit for an available item', async () => {
    const fixture = await createPage('poltrona-nuvem');
    const buttons = fixture.nativeElement.querySelectorAll('.checkout-button');

    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('R$');
    expect(buttons[0].textContent).toContain('1.890,00');
    expect(buttons[1].textContent).toContain('567,00');
    expect(buttons[1].textContent).toContain('30%');
  });

  it('explains when a checkout is already in progress for the product', async () => {
    const redirects: string[] = [];
    const fixture = await createPage('poltrona-nuvem', undefined, () =>
      throwError(() => new HttpErrorResponse({ status: 409 })),
      (url) => redirects.push(url)
    );

    const depositButton: HTMLButtonElement =
      fixture.nativeElement.querySelector('.checkout-button.secondary');
    depositButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.checkoutErrorMessage).toContain('Retome a opção escolhida');
    expect(fixture.nativeElement.textContent).toContain('Retome a opção escolhida');
    expect(new URL(redirects[0]).searchParams.get('text'))
      .toContain('Quero reservar esse item');
    expect(new URL(redirects[0]).searchParams.get('text')).toContain('poltrona-nuvem');
  });

  it('shows a visible error when reservation status cannot be checked', async () => {
    const redirects: string[] = [];
    const fixture = await createPage('poltrona-nuvem', () =>
      throwError(() => new Error('API unavailable')),
      undefined,
      (url) => redirects.push(url)
    );

    expect(fixture.nativeElement.querySelector('.availability').textContent)
      .toContain('Não foi possível verificar a disponibilidade.');
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.checkout-button');
    expect(Array.from(buttons).every((button) => button.disabled)).toBe(true);
    expect(new URL(redirects[0]).hostname).toBe('wa.me');
    expect(new URL(redirects[0]).pathname).toBe('/5547992626735');
    expect(new URL(redirects[0]).searchParams.get('text'))
      .toContain('ao verificar a disponibilidade do item Poltrona Nuvem');
  });

  it('provides a storefront link for an unknown product slug', async () => {
    const fixture = await createPage('item-inexistente');

    expect(fixture.nativeElement.textContent).toContain('Este item não está no acervo.');
    expect(fixture.nativeElement.querySelector('a.back-cta').getAttribute('routerLink')).toBe('/home');
  });
});
