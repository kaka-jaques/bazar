import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ReservationStatus {
  slug: string;
  reserved: boolean;
}

@Injectable({ providedIn: 'root' })
export class ReservationService {
  private readonly http = inject(HttpClient);

  getStatus(slug: string): Observable<ReservationStatus> {
    return this.http.get<ReservationStatus>(
      `/api/reservations/${encodeURIComponent(slug)}`
    );
  }
}
