import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { Dialog, ISessionContext, showDialog } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { Widget } from '@lumino/widgets';

/**
 * Module federation fills this scope with the packages that the page shares.
 */
declare const __webpack_share_scopes__: Record<
  string,
  Record<string, Record<string, unknown>>
>;

const COMMAND = 'try-jupyter:report-problem';

/**
 * Kernels that jupyterlite-xeus provides on this site.
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
          label:
            'The Jupyter Notebook interface: menus, file browser, editing, layout',
          repository: 'jupyter/notebook'
        }
      : {
          label:
            'The JupyterLab interface: menus, file browser, editing, layout',
          repository: 'jupyterlab/jupyterlab'
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
    { label: 'The AI assistant', repository: 'jupyterlab/jupyter-ai-lite' },
    {
      label: 'An example notebook, or I am not sure',
      repository: 'jupyter/try-jupyter'
    }
  ];
}

/**
 * The highest version of a package in the share scope of the page.
 */
function sharedVersion(name: string): string {
  try {
    const versions = Object.keys(__webpack_share_scopes__.default[name] ?? {});
    versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return versions.pop() ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function issueUrl(repository: string, context: IPageContext): string {
  const lab = sharedVersion('@jupyterlab/application');
  const ui = context.notebookInterface
    ? `Jupyter Notebook ${sharedVersion('@jupyter-notebook/application')} (JupyterLab ${lab})`
    : `JupyterLab ${lab}`;
  const body = [
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
  return `https://github.com/${repository}/issues/new?${new URLSearchParams({ body })}`;
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
      input.checked = index === 0;
      label.append(input, option.label);
      fieldset.appendChild(label);
    });
    this.node.appendChild(fieldset);
    const note = document.createElement('p');
    note.className = 'jp-TryJupyterFeedback-note';
    note.textContent =
      'This opens a new GitHub issue with the details of this page filled in. You need a GitHub account to submit it.';
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
        if (result.button.accept && result.value !== null) {
          const { repository } = options[result.value];
          window.open(issueUrl(repository, context), '_blank', 'noopener');
        }
      }
    });
  }
};

export default plugin;
