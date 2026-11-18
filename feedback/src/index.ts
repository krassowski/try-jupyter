import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, ISessionContext, showDialog } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';

const COMMAND = 'try-jupyter:report-problem';

/**
 * Kernels that jupyterlite-xeus provides on this site.
 *
 * Keep in step with KERNELS_TO_KEEP in scripts/filter_xeus_kernels.py.
 */
const XEUS_KERNELS = new Set([
  'xpython',
  'xcpp23',
  'xc23',
  'xr',
  'xsqlite',
  'fortran'
]);

/**
 * What the page shows when the dialog opens.
 */
interface IPageContext {
  notebookInterface: boolean;
  kernelName: string | null;
  kernelDisplayName: string | null;
}

/**
 * An answer to the question, and the repository that receives the report.
 */
interface IChoice {
  label: string;
  repository: string;
  /**
   * The issue template to open. Repositories that disable blank issues send
   * an issue URL without a template to their template chooser.
   */
  template?: string;
}

function choices(context: IPageContext): IChoice[] {
  let kernelRepository = 'jupyter/try-jupyter';
  if (context.kernelName === 'python') {
    kernelRepository = 'jupyterlite/pyodide-kernel';
  } else if (context.kernelName && XEUS_KERNELS.has(context.kernelName)) {
    kernelRepository = 'jupyterlite/xeus';
  }
  return [
    context.notebookInterface
      ? {
          label: 'The Jupyter Notebook interface: menus, editing, layout',
          repository: 'jupyter/notebook',
          template: 'bug_report.md'
        }
      : {
          label: 'The JupyterLab interface: menus, editing, layout',
          repository: 'jupyterlab/jupyterlab',
          template: 'bug_report.md'
        },
    {
      label: context.kernelDisplayName
        ? `Running code in the ${context.kernelDisplayName} kernel`
        : 'Running code',
      repository: kernelRepository
    },
    {
      label: 'Opening, saving or uploading files',
      repository: 'jupyterlite/jupyterlite'
    },
    { label: 'The terminal', repository: 'jupyterlite/terminal' },
    {
      label: 'The AI assistant',
      repository: 'jupyterlab/jupyter-ai-lite',
      template: 'bug_report.md'
    },
    {
      label: 'An example notebook, or I am not sure',
      repository: 'jupyter/try-jupyter'
    }
  ];
}

/**
 * The version of a package that the site lists in its About dialog.
 */
function siteVersion(name: string): string {
  const info = JSON.parse(PageConfig.getOption('versionInfo') || '{}');
  return info[name]?.version ?? 'unknown';
}

function issueBody(context: IPageContext): string {
  const lab = siteVersion('@jupyterlab/application');
  const ui = context.notebookInterface
    ? `Jupyter Notebook ${siteVersion('@jupyter-notebook/application')} (JupyterLab ${lab})`
    : `JupyterLab ${lab}`;
  return [
    '## Description',
    '',
    '<!-- What did you do, what happened, and what did you expect? -->',
    '',
    '## Context',
    '',
    `- Found on: ${location.origin}${location.pathname}`,
    `- Interface: ${ui}`,
    `- JupyterLite: ${PageConfig.getOption('appVersion')}`,
    `- Kernel: ${context.kernelDisplayName ?? 'none'}`,
    `- Browser: ${navigator.userAgent}`
  ].join('\n');
}

function issueUrl(choice: IChoice, body: string): string {
  const query = new URLSearchParams({ title: 'Try Jupyter: ', body });
  if (choice.template) {
    query.set('template', choice.template);
  }
  return `https://github.com/${choice.repository}/issues/new?${query}`;
}

/**
 * The dialog body: one question, one radio button per answer.
 */
class ChoiceBody extends Widget implements Dialog.IBodyWidget<number> {
  constructor(options: IChoice[]) {
    super();
    this.addClass('jp-TryJupyterFeedback');
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'What is the problem about?';
    fieldset.appendChild(legend);
    options.forEach((option, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'try-jupyter-feedback';
      input.value = String(index);
      // A bare Enter then reports to jupyter/try-jupyter, which can triage it.
      input.checked = index === options.length - 1;
      label.append(input, option.label);
      fieldset.appendChild(label);
    });
    this.node.appendChild(fieldset);
    const note = document.createElement('p');
    note.className = 'jp-TryJupyterFeedback-note';
    note.textContent =
      'This opens a new GitHub issue with the details of this page filled in, and copies the details to the clipboard. You need a GitHub account to submit the issue.';
    this.node.appendChild(note);
  }

  getValue(): number {
    const checked = this.node.querySelector<HTMLInputElement>('input:checked');
    return checked ? Number(checked.value) : 0;
  }
}

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'try-jupyter-feedback:plugin',
  description:
    'Asks one question, then opens a pre-filled issue in the repository of the broken part.',
  autoStart: true,
  activate: (app: JupyterFrontEnd): void => {
    app.commands.addCommand(COMMAND, {
      label: 'Report a Problem…',
      execute: async () => {
        const widget = app.shell.currentWidget as
          | (Widget & { sessionContext?: ISessionContext })
          | null;
        const sessionContext = widget?.sessionContext;
        const kernel = sessionContext?.session?.kernel ?? null;
        const context: IPageContext = {
          notebookInterface: !!PageConfig.getOption('notebookPage'),
          kernelName: kernel?.name ?? null,
          kernelDisplayName: kernel
            ? (sessionContext?.kernelDisplayName ?? kernel.name)
            : null
        };
        const options = choices(context);
        const result = await showDialog({
          title: 'Report a Problem',
          body: new ChoiceBody(options),
          buttons: [
            Dialog.cancelButton(),
            Dialog.okButton({ label: 'Continue on GitHub' })
          ]
        });
        if (!result.button.accept || result.value === null) {
          return;
        }
        const body = issueBody(context);
        // GitHub may open a template without the body for visitors who cannot write to the repository.
        await navigator.clipboard?.writeText(body).catch(() => undefined);
        window.open(
          issueUrl(options[result.value], body),
          '_blank',
          'noopener'
        );
      }
    });
  }
};

export default plugin;
