import type {
  CognitoMfaConfiguration,
  CognitoUsernameMode,
  CognitoVerifiedAttribute,
} from "../../services/cognito/cognito-service"

export interface UserPoolFormInitial {
  actionUrl: string
  name: string
  usernameMode: CognitoUsernameMode
  autoVerifiedAttributes: CognitoVerifiedAttribute[]
  mfaConfiguration: CognitoMfaConfiguration
}
