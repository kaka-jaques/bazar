import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { IonicModule } from '@ionic/angular/lazy';
import { PaymentReturnPageRoutingModule } from './payment-return-routing.module';
import { PaymentReturnPage } from './payment-return.page';

@NgModule({
  imports: [CommonModule, IonicModule, PaymentReturnPageRoutingModule],
  declarations: [PaymentReturnPage],
})
export class PaymentReturnPageModule {}
