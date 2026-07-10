export interface Club {
  id: string;
  name: string;
  code: string;
  description: string;
  managerName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}
