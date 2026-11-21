import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PaymentReturnPage } from './payment-return.page';

const routes: Routes = [{ path: '', component: PaymentReturnPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PaymentReturnPageRoutingModule {}
