import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular/lazy';
import { of } from 'rxjs';
import { PaymentService } from '../payments/payment.service';
import { PaymentReturnPage } from './payment-return.page';

describe('PaymentReturnPage', () => {
  it('asks the server to verify the provider callback before showing success', async () => {
    let verificationArguments: string[] = [];
    await TestBed.configureTestingModule({
      declarations: [PaymentReturnPage],
      imports: [CommonModule, IonicModule.forRoot(), RouterModule.forRoot([])],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({
                order_nsu: 'order-1',
                transaction_nsu: 'transaction-1',
                slug: 'invoice-1',
              }),
            },
          },
        },
        {
          provide: PaymentService,
          useValue: {
            confirmPayment: (orderNsu: string, transactionNsu: string, invoiceSlug: string) => {
              verificationArguments = [orderNsu, transactionNsu, invoiceSlug];
              return of({ status: 'paid', productSlug: 'poltrona-nuvem' });
            },
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<PaymentReturnPage> =
      TestBed.createComponent(PaymentReturnPage);
    fixture.detectChanges();

    expect(verificationArguments).toEqual(['order-1', 'transaction-1', 'invoice-1']);
    expect(fixture.nativeElement.textContent).toContain('PAGAMENTO APROVADO');
    expect(fixture.nativeElement.textContent).toContain('O pagamento foi confirmado');
  });

  it('does not show success when the provider callback fields are missing', async () => {
    await TestBed.configureTestingModule({
      declarations: [PaymentReturnPage],
      imports: [CommonModule, IonicModule.forRoot(), RouterModule.forRoot([])],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: PaymentService,
          useValue: { confirmPayment: () => of({ status: 'paid', productSlug: 'poltrona-nuvem' }) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PaymentReturnPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('NÃO FOI POSSÍVEL CONFIRMAR');
    expect(fixture.nativeElement.textContent).not.toContain('PAGAMENTO APROVADO');
  });
});
