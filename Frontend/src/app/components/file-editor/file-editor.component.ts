import {
  Component,
  signal,
  viewChild,
  effect,
  afterNextRender,
  OnDestroy,
  ElementRef,
  inject,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor';
import { ProjectFilesService } from '../../core/services/project-files.service';
import { ProjectFileEntryResponse, ProjectResponse } from '../../core/models/project-files.models';

interface FileEntry extends ProjectFileEntryResponse {
  language: string;
  content?: string;
}

@Component({
  selector: 'app-file-editor',
  standalone: true,
  imports: [],
  templateUrl: './file-editor.component.html',
  styleUrl: './file-editor.component.css',
})
export class FileEditorComponent implements OnDestroy {
  // Modern Angular signals
  readonly editorContainer = viewChild<ElementRef>('editorContainer');

  private readonly projectFilesService = inject(ProjectFilesService);
  private readonly monacoReady: Promise<typeof monaco>;

  private editor: monaco.editor.IStandaloneCodeEditor | null = null;

  readonly currentFile = signal<FileEntry | null>(null);
  readonly files = signal<FileEntry[]>([]);
  readonly projectId = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isSaving = signal(false);
  readonly saveMessage = signal<string | null>(null);

  private readonly seedLogin = {
    email: 'user@prismatic.local',
    password: 'User123!',
  };

  constructor() {
    loader.config({
      paths: {
        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs',
      },
    });

    this.monacoReady = loader.init();

    afterNextRender(() => {
      void this.loadInitialProject();
    });

    effect(() => {
      const container = this.editorContainer();
      const current = this.currentFile();
      if (container && current) {
        void this.ensureEditor(container, current);
      }
    });
  }

  private async ensureEditor(container: ElementRef, file: FileEntry) {
    const monacoInstance = await this.monacoReady;

    if (!this.editor) {
      this.editor = monacoInstance.editor.create(container.nativeElement, {
        value: file.content ?? '',
        language: file.language,
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        readOnly: false,
      });

      this.editor.onDidChangeModelContent(() => {
        const current = this.currentFile();
        if (current && this.editor) {
          current.content = this.editor.getValue();
        }
      });

      return;
    }

    const previousModel = this.editor.getModel();
    const model = monaco.editor.createModel(file.content ?? '', file.language);
    this.editor.setModel(model);
    previousModel?.dispose();
  }

  async switchFile(file: FileEntry) {
    const current = this.currentFile();
    if (current && this.editor) {
      current.content = this.editor.getValue();
    }

    if (file !== current) {
      await this.openFile(file);
    }
  }

  async saveCurrentFile() {
    const current = this.currentFile();
    const projectId = this.projectId();
    if (!current || !projectId || !this.editor) {
      return;
    }

    current.content = this.editor.getValue();
    this.isSaving.set(true);
    this.saveMessage.set(null);

    try {
      await firstValueFrom(
        this.projectFilesService.updateProjectFileContent(
          projectId,
          current.path,
          current.content ?? '',
        ),
      );

      this.saveMessage.set('Salvat');
      setTimeout(() => this.saveMessage.set(null), 2000);
    } catch (error) {
      console.error(error);
      this.saveMessage.set('Eroare la salvare');
    } finally {
      this.isSaving.set(false);
    }
  }

  private async loadInitialProject() {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const project = await this.fetchFirstProject();
      if (!project) {
        this.errorMessage.set('Nu există proiecte disponibile pentru acest cont.');
        return;
      }

      this.projectId.set(project.projectId);
      await this.loadProjectFiles(project);
    } catch (error) {
      console.error(error);

      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        const loggedIn = await this.trySeedLogin();
        if (loggedIn) {
          try {
            const project = await this.fetchFirstProject();
            if (!project) {
              this.errorMessage.set('Nu există proiecte disponibile pentru acest cont.');
              return;
            }

            this.projectId.set(project.projectId);
            await this.loadProjectFiles(project);
            return;
          } catch (retryError) {
            console.error(retryError);
          }
        }

        this.errorMessage.set('Nu ești autentificat. Te rog fă login.');
        return;
      }

      this.errorMessage.set('Nu pot încărca fișierele proiectului.');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchFirstProject(): Promise<ProjectResponse | null> {
    const projects = await firstValueFrom(this.projectFilesService.getProjects());
    return projects[0] ?? null;
  }

  private async trySeedLogin(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.projectFilesService.login(this.seedLogin.email, this.seedLogin.password),
      );
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private async loadProjectFiles(project: ProjectResponse) {
    const entries = await firstValueFrom(
      this.projectFilesService.getProjectFiles(project.projectId),
    );

    const mapped = entries.map((entry) => ({
      ...entry,
      language: this.mapLanguage(entry.extension),
    }));

    this.files.set(mapped);

    if (mapped.length > 0) {
      await this.openFile(mapped[0]);
    }
  }

  private async openFile(file: FileEntry) {
    const projectId = this.projectId();
    if (!projectId) {
      return;
    }

    if (!file.content) {
      const response = await firstValueFrom(
        this.projectFilesService.getProjectFileContent(projectId, file.path),
      );
      file.content = response.content;
    }

    this.currentFile.set(file);
  }

  private mapLanguage(extension: string): string {
    switch (extension.toLowerCase()) {
      case '.html':
        return 'html';
      case '.css':
        return 'css';
      case '.js':
        return 'javascript';
      case '.ts':
        return 'typescript';
      case '.json':
        return 'json';
      case '.cs':
        return 'csharp';
      case '.md':
        return 'markdown';
      default:
        return 'plaintext';
    }
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.dispose();
    }
  }
}
