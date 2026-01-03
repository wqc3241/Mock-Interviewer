

export interface JobDescription {
  title: string;
  content: string;
  link?: string;
  interviewerInfo?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

export interface SavedProfile {
  id: string;
  label: string;
  title: string;
  content: string;
  link?: string;
  interviewerInfo?: string;
  createdAt: number;
}

export interface ResearchedPersona {
  name: string;
  style: string;
  companyVibe: string;
  keyTopics: string[];
  backgroundSummary: string;
}

export interface InterviewSettings {
  timeLimitSeconds: number;
}

export interface TranscriptItem {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface FeedbackSection {
  question: string;
  userAnswerSummary: string;
  rating: number;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export interface FeedbackReport {
  overallScore: number;
  summary: string;
  sections: FeedbackSection[];
}

export enum AppState {
  SETUP = 'SETUP',
  RESEARCHING = 'RESEARCHING',
  INTERVIEW = 'INTERVIEW',
  FEEDBACK = 'FEEDBACK',
}
