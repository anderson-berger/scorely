import { authRoute } from '@scorely/api/src/lib/auth';
import { mailer } from '@scorely/api/src/lib/email';
import { env } from '@scorely/api/src/lib/env';
import { lazy } from '@scorely/api/src/lib/fn';
import { type HttpEvent, parseBody, route } from '@scorely/api/src/lib/http';
import { createAuthService } from '@scorely/api/src/modules/auth/auth.service';
import { dynamoAuthRepository } from '@scorely/api/src/modules/auth/data/auth.repository';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/data/notifications.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notifications.service';
import { dynamoUserRepository } from '@scorely/api/src/modules/users/data/users.repository';
import { createUserService } from '@scorely/api/src/modules/users/users.service';
import {
  type LoginResult,
  type RefreshInput,
  RefreshInputSchema,
  type RefreshResult,
  type RequestCodeInput,
  RequestCodeInputSchema,
  type RequestCodeResult,
  type VerifyCodeInput,
  VerifyCodeInputSchema,
} from '@scorely/contracts';

// Criado na primeira chamada: o env (segredo) só é lido quando a Lambda roda.
const auth = lazy(() =>
  createAuthService({
    repo: dynamoAuthRepository,
    users: createUserService(dynamoUserRepository),
    notifications: createNotificationService(dynamoNotificationRepository),
    mailer: mailer(),
    secret: env().AUTH_SECRET,
  }),
);

// Rotas públicas (sem authorizer).
export async function requestCode(event: HttpEvent) {
  return route(event, async () => {
    const { email, locale }: RequestCodeInput = parseBody(event, RequestCodeInputSchema);
    const result: RequestCodeResult = await auth().requestCode(email, locale);
    return result;
  });
}

export async function verifyCode(event: HttpEvent) {
  return route(event, async () => {
    const { email, code }: VerifyCodeInput = parseBody(event, VerifyCodeInputSchema);
    const result: LoginResult = await auth().verifyCode(email, code);
    return result;
  });
}

export async function refresh(event: HttpEvent) {
  return route(event, async () => {
    const { refreshToken }: RefreshInput = parseBody(event, RefreshInputSchema);
    const result: RefreshResult = await auth().refresh(refreshToken);
    return result;
  });
}

// Rotas com authorizer.
export async function logout(event: HttpEvent) {
  return authRoute(event, async ({ sessionId }) => {
    await auth().logout(sessionId);
  });
}
