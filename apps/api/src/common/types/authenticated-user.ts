export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  permissions: string[];
};
