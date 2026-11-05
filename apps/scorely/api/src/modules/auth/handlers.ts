import { RefreshInputSchema, RequestCodeInputSchema, VerifyCodeInputSchema } from '@scorely/contracts';
import { authHandlers } from '../../lib/auth';
import { mailer } from '../../lib/email';
import { env } from '../../lib/env';
import { lazy } from '../../lib/fn';
import { handlers, parseBody } from '../../lib/http';
import { dynamoNotificationRepository } from '../notifications/notification.repository';
import { createNotificationService } from '../notifications/notification.service';
import { dynamoUserRepository } from '../users/user.repository';
import { createUserService } from '../users/user.service';
import { dynamoAuthRepository } from './auth.repository';
import { createAuthService } from './auth.service';

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
export const { requestCode, verifyCode, refresh } = handlers({
  async requestCode(event) {
    const { email, locale } = parseBody(event, RequestCodeInputSchema);
    return auth().requestCode(email, locale);
  },

  async verifyCode(event) {
    const { email, code } = parseBody(event, VerifyCodeInputSchema);
    return auth().verifyCode(email, code);
  },

  async refresh(event) {
    const { refreshToken } = parseBody(event, RefreshInputSchema);
    return auth().refresh(refreshToken);
  },
});

// Rotas com authorizer.
export const { logout } = authHandlers({
  async logout(_event, { sessionId }) {
    await auth().logout(sessionId);
  },
});
