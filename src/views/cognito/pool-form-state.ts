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

export function makeUserPoolFormAlpineState(init: UserPoolFormInitial): string {
  return `{
  actionUrl: ${JSON.stringify(init.actionUrl)},
  name: ${JSON.stringify(init.name)},
  usernameMode: ${JSON.stringify(init.usernameMode)},
  autoVerifyEmail: ${init.autoVerifiedAttributes.includes("email")},
  autoVerifyPhoneNumber: ${init.autoVerifiedAttributes.includes("phone_number")},
  mfaConfiguration: ${JSON.stringify(init.mfaConfiguration)},
  error: null,
  submitting: false,

  buildPayload() {
    const autoVerifiedAttributes = [];
    if (this.autoVerifyEmail) autoVerifiedAttributes.push('email');
    if (this.autoVerifyPhoneNumber) autoVerifiedAttributes.push('phone_number');

    return {
      name: this.name,
      usernameMode: this.usernameMode,
      autoVerifiedAttributes,
      mfaConfiguration: this.mfaConfiguration,
    };
  },

  async submit() {
    this.error = null;
    this.submitting = true;

    try {
      const data = await globalThis.floci.requestJson(this.actionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload()),
      });

      window.location.href = data.id
        ? ('/cognito/' + encodeURIComponent(data.id))
        : '/cognito';
    } catch (error) {
      this.error = globalThis.floci.errorMessage(error);
      this.submitting = false;
    }
  },
}`
}
