import type { AWS } from "@serverless/typescript";

import { provider } from "@serverless/provider";
import { resources } from "@serverless/resources";

import { authorizer } from "@serverless/functions/authorizer";
import { auth } from "@serverless/functions/auth";
import { user } from "@serverless/functions/user";
import { team } from "@serverless/functions/team";
import { file } from "@serverless/functions/file";
import { health } from "@serverless/functions/health";

const serverlessConfiguration: AWS = {
  service: "scorely",
  frameworkVersion: "4",
  provider,
  plugins: ["serverless-offline"],
  custom: {
    "serverless-offline": {
      httpPort: 3000,
    },
  },
  functions: {
    ...authorizer,
    ...auth,
    ...user,
    ...team,
    ...file,
    ...health,
  },
  resources,
};

export default serverlessConfiguration;
