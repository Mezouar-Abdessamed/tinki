import { authApi, type AuthSession } from "@/lib/api";
import {
  sendSignupVerificationEmail,
  type SignupVerificationResult,
} from "@/lib/firebase-auth";

export type SignupValues = {
  email: string;
  password: string;
  username: string;
  origin?: string;
};

export type SignUpFn = (input: {
  email: string;
  password: string;
  username: string;
}) => Promise<AuthSession>;

/** Create an account and require a real authenticated session before continuing. */
export async function signUpDirectly(
  values: SignupValues,
  signUp: SignUpFn = (input) => authApi.signUp(input),
): Promise<AuthSession> {
  const session = await signUp({
    email: values.email,
    password: values.password,
    username: values.username,
  });
  if (!session || !session.access_token) {
    throw new Error("We couldn't finish signing you in — please try logging in");
  }
  return session;
}

export type SignUpWithVerificationFn = (input: {
  email: string;
  password: string;
  username: string;
}) => Promise<SignupVerificationResult>;

/** Reserve the signup and send a confirmation email before activating the profile. */
export async function signUpWithEmailConfirmation(
  values: SignupValues,
  sendVerification: SignUpWithVerificationFn = sendSignupVerificationEmail,
): Promise<SignupVerificationResult> {
  return sendVerification({
    email: values.email,
    password: values.password,
    username: values.username,
  });
}
