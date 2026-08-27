import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

/**
 * Başarılı yanıtları `docs/03_API_CONTRACTS.md` §2 response envelope'una sarar:
 *
 *   { data: <payload>, meta: { timestamp } }
 *
 * Servis bir liste + `pagination` döndürdüğünde (`{ data, pagination }`),
 * `pagination` üst düzeyde korunur ve yalnızca `meta` eklenir (§1).
 *
 * `204 No Content` (gövdesiz) yanıtlar olduğu gibi geçirilir.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        const meta = { timestamp: new Date().toISOString() };

        if (payload === undefined || payload === null) {
          return payload;
        }

        if (
          typeof payload === "object" &&
          "data" in payload &&
          "pagination" in payload
        ) {
          return { ...payload, meta };
        }

        return { data: payload, meta };
      }),
    );
  }
}
