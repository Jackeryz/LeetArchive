import { UserExtensionSettings } from '../types/leetcode';
import { DEFAULT_USER_SETTINGS } from '../core/config';

export class SettingsModel implements UserExtensionSettings {
  public githubToken: string | null;
  public selectedRepo: string | null;
  public branch: string;
  public folderStructure: 'difficulty' | 'flat' | 'tag';
  public autoSync: boolean;
  public syncReadme: boolean;

  constructor(settings?: Partial<UserExtensionSettings>) {
    this.githubToken = settings?.githubToken ?? DEFAULT_USER_SETTINGS.githubToken;
    this.selectedRepo = settings?.selectedRepo ?? DEFAULT_USER_SETTINGS.selectedRepo;
    this.branch = settings?.branch ?? DEFAULT_USER_SETTINGS.branch;
    this.folderStructure = settings?.folderStructure ?? DEFAULT_USER_SETTINGS.folderStructure;
    this.autoSync = settings?.autoSync ?? DEFAULT_USER_SETTINGS.autoSync;
    this.syncReadme = settings?.syncReadme ?? DEFAULT_USER_SETTINGS.syncReadme;
  }

  public isConfigured(): boolean {
    return Boolean(this.githubToken && this.selectedRepo);
  }
}
