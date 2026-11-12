import { authRoute } from '@scorely/api/src/lib/auth';
import { mailer } from '@scorely/api/src/lib/email';
import { env } from '@scorely/api/src/lib/env';
import { lazy } from '@scorely/api/src/lib/fn';
import { type HttpEvent, parseBody, route } from '@scorely/api/src/lib/http';
import { dynamoAuthRepository } from '@scorely/api/src/modules/auth/auth.repository';
import { createAuthService } from '@scorely/api/src/modules/auth/auth.service';
import { dynamoNotificationRepository } from '@scorely/api/src/modules/notifications/notification.repository';
import { createNotificationService } from '@scorely/api/src/modules/notifications/notification.service';
import { dynamoUserRepository } from '@scorely/api/src/modules/users/user.repository';
import { createUserService } from '@scorely/api/src/modules/users/user.service';
import { RefreshInputSchema, RequestCodeInputSchema, VerifyCodeInputSchema } from '@scorely/contracts';

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
    const { email, locale } = parseBody(event, RequestCodeInputSchema);
    return auth().requestCode(email, locale);
  });
}

export async function verifyCode(event: HttpEvent) {
  return route(event, async () => {
    const { email, code } = parseBody(event, VerifyCodeInputSchema);
    return auth().verifyCode(email, code);
  });
}

export async function refresh(event: HttpEvent) {
  return route(event, async () => {
    const { refreshToken } = parseBody(event, RefreshInputSchema);
    return auth().refresh(refreshToken);
  });
}

// Rotas com authorizer.
export async function logout(event: HttpEvent) {
  return authRoute(event, async ({ sessionId }) => {
    await auth().logout(sessionId);
  });
}
