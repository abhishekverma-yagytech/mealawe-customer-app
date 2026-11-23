import { ENDPOINTS, http } from '@mealawe/core';

export interface Faq {
  question: string;
  answer: string;
}

export type FeedbackType = 'suggestion' | 'praise' | 'complaint';

export interface FeedbackPayload {
  feedbackType: FeedbackType;
  feedbackComment: string;
  feedbackFrom_id: string;
  feedbackFrom_name?: string;
  feedbackFrom_phoneNo?: string;
  feedbackFrom_userType: 'customer';
}

export interface SupportContacts {
  phone?: string;
  email?: string;
}

/** Help + feedback API — ported from mealaweApp apiMain. */
export const supportApi = {
  /** FAQ list (filtered to entries that have a question). */
  async getFaqs(): Promise<Faq[]> {
    const res = await http.get<unknown>(ENDPOINTS.support.faq);
    const list = Array.isArray(res) ? (res as Faq[]) : [];
    return list.filter((f) => f && f.question);
  },

  /** Support phone + email from the backend config variables. */
  async getSupportContacts(): Promise<SupportContacts> {
    const res = await http.post<{ configName: string; configData: string }[]>(
      ENDPOINTS.support.variables,
      { variableNames: ['SUPPORT_PHONE_NO', 'SUPPORT_EMAIL_ID'] },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    return { phone: map.SUPPORT_PHONE_NO, email: map.SUPPORT_EMAIL_ID };
  },

  /** Submit general app feedback. */
  submitFeedback: (payload: FeedbackPayload) =>
    http.post<unknown>(ENDPOINTS.support.feedback, payload),
};
