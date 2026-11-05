import { ArrowRight, Check, CircleCheck } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useStatus } from "~/backend/queries";
import { BrandMark } from "~/components/brand";
import { Accent, Container, Eyebrow, PermissionLine, PermissionList, Tag } from "~/components/io";
import { PAGE_TITLE_FOCUS } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { Locked } from "~/components/ui/misc";
import { copy } from "~/copy";
import { onboardingCopy as t } from "~/copy/onboarding";
import { cn } from "~/lib/cn";
import { navigate } from "~/lib/router";

import { KeyField, NameField, StarterField, focusComposerWhenReady, useProjectDraft } from "../projects/project-form";
import { useUi } from "../shell/ui-store";

const CURRENT = 2;

/**
 * First start (design v2-Onboarding): a step frame of five with the model service as the finished
 * first step and "your first project and its key" as the current one. The form itself is the one
 * screen it always was: name, starter chips, the key, Begin (create → link; a refused key keeps the
 * person here with the error under the field, C6). In user mode the one key is linked first.
 * It lands in the new project's chats with the composer focused. The window title stays the app's
 * name (the packaged smoke test reads it), so no hero hook sets one here.
 */
export function Onboarding() {
  const backend = useBackend();
  const status = useStatus();
  const rememberProject = useUi((state) => state.rememberProject);
  const draft = useProjectDraft();
  const readOnly = status.data?.readOnly ?? false;
  const userMode = status.data?.keyMode === "user";

  const begin = async () => {
    const project = await draft.create({ folderPath: null, requireKey: true });
    if (!project) return;
    rememberProject(project.id);
    // Navigate before the gate lifts (app.tsx sends #/welkom home once a project is listed): the
    // project's chats hold the composer the first message goes into.
    navigate({ name: "project", projectId: project.id, chatId: null }, { replace: true });
    focusComposerWhenReady();
  };

  const steps = [
    { label: t.steps.service, state: "done" },
    { label: userMode ? t.steps.projectUser : t.steps.project, state: "current" },
    { label: t.steps.library, state: "later" },
    { label: t.steps.mail, state: "later" },
    { label: t.steps.capture, state: "later" },
  ] as const;

  const serviceLine = !status.data
    ? null
    : !userMode
      ? t.serviceProjectKeys
      : status.data.user.hasKey
        ? t.serviceUserLinked(status.data.user.keyHint ?? "")
        : t.serviceUserKey;

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink">
      {/* In the desktop shell this strip moves the window. */}
      <div className="fixed inset-x-0 top-0 h-10" data-titlebar="strip" aria-hidden="true" />
      <header className="border-b border-line">
        <Container className="flex min-h-[88px] flex-wrap items-center gap-x-6 gap-y-2 py-4">
          <span className="flex items-center gap-2.5">
            <BrandMark className="size-10" />
            <span className="text-lg font-bold tracking-tight">{copy.appName}</span>
            {backend.mode === "demo" ? (
              <Chip tone="accent" size="sm">
                {copy.boot.demoBadge}
              </Chip>
            ) : null}
          </span>
          <p className="m-0 ms-auto text-base text-ink-muted">{t.setupNote}</p>
        </Container>
      </header>

      <main className="flex-1">
        <section aria-labelledby="welcome-title" className="bg-surface pb-12 pt-10 lg:pt-14">
          <Container className="flex flex-col gap-3">
            <Eyebrow>
              <span id="welcome-progress">{t.progress(CURRENT, steps.length)}</span>
            </Eyebrow>
            <h1 id="welcome-title" tabIndex={-1} data-page-title="" className={cn("m-0 max-w-[22ch] text-[40px] font-bold leading-[44px] tracking-[-0.02em] sm:text-[56px] sm:leading-[60px]", PAGE_TITLE_FOCUS)}>
              {t.titleBefore}
              <Accent>{t.titleAccent}</Accent>
              {t.titleAfter}
            </h1>
            <p className="mb-0 mt-3 max-w-[60ch] text-xl text-ink-muted">{t.lead}</p>
            <ol aria-labelledby="welcome-progress" className="m-0 mt-6 grid list-none grid-cols-5 gap-2 p-0 sm:gap-4">
              {steps.map((step, index) => (
                <li
                  key={step.label}
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={cn(
                    "flex min-w-0 flex-col gap-3 border-t-[3px] pt-4 text-base",
                    step.state === "later" ? "border-line text-ink-muted" : "border-ink",
                    step.state === "current" ? "font-bold text-ink" : step.state === "done" ? "font-semibold text-ink" : "font-normal",
                  )}
                >
                  <span className="text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">
                    {String(index + 1).padStart(2, "0")}
                    {step.state === "current" ? <span className="hidden sm:inline">{` · ${t.now}`}</span> : null}
                  </span>
                  <span className="sr-only sm:not-sr-only sm:inline-flex sm:items-center sm:gap-1.5">
                    {step.state === "done" ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : null}
                    {step.label}
                    {step.state === "done" ? <span className="sr-only">{` (${t.done})`}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <div className="bg-surface-alt">
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 py-10 sm:px-12 lg:py-16">
            <section aria-labelledby="welcome-service" className="flex flex-wrap items-center gap-5 rounded-card bg-surface-raised px-6 py-6 sm:px-8">
              <CircleCheck className="size-6 shrink-0 text-success" aria-hidden="true" />
              <div className="flex min-w-0 flex-[1_1_320px] flex-col">
                <h2 id="welcome-service" className="m-0 text-lg font-semibold text-ink">
                  {t.serviceDone}
                </h2>
                {status.data ? (
                  <p className="m-0 text-sm text-ink-muted">
                    <span className="break-all font-mono text-ink" data-testid="litellm-server">
                      {status.data.litellmBaseUrl}
                    </span>
                    {` · ${serviceLine ?? ""}`}
                  </p>
                ) : null}
              </div>
            </section>

            <section aria-labelledby="welcome-step" className="rounded-panel bg-surface-raised p-6 sm:p-12">
              <form
                className="flex flex-col gap-6"
                data-testid="welcome"
                onSubmit={(event) => {
                  event.preventDefault();
                  void begin();
                }}
              >
                <div className="flex flex-col gap-3">
                  <Eyebrow>{t.stepEyebrow(CURRENT)}</Eyebrow>
                  <h2 id="welcome-step" className="m-0 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-ink">
                    {copy.onboarding.title}
                  </h2>
                  <p className="m-0 max-w-[60ch] text-lg text-ink-muted">{t.lead2}</p>
                </div>

                <div className="flex flex-col gap-5 border-t border-line-strong pt-6">
                  <NameField draft={draft} autoFocus />
                  <StarterField draft={draft} />
                  <KeyField draft={draft} required hint testId="litellm-key-input" />
                </div>

                {draft.error?.field === "form" ? (
                  <p className="m-0 text-base text-danger" role="alert">
                    {draft.error.message}
                  </p>
                ) : null}
                {readOnly ? <Locked>{copy.settings.readOnly}</Locked> : null}

                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-3">
                  <Button type="submit" variant="primary" size="xl" disabled={draft.busy || readOnly} data-testid="litellm-key-submit">
                    {draft.busy ? copy.onboarding.beginning : copy.onboarding.begin}
                    {draft.busy ? null : <ArrowRight aria-hidden="true" />}
                  </Button>
                  <p className="m-0 text-sm text-ink-muted">{t.required}</p>
                </div>
              </form>
            </section>

            <section aria-labelledby="welcome-next" className="flex flex-col gap-4 rounded-card border border-dashed border-line-strong p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <h2 id="welcome-next" className="m-0 flex-1 text-xl font-semibold text-ink">
                  {t.nextTitle}
                </h2>
                <Tag>{t.optional}</Tag>
              </div>
              <p className="m-0 text-base text-ink-muted">{t.nextLead}</p>
              <PermissionList className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {t.nextLines.map((line) => (
                  <PermissionLine key={line.strong} kind={line.kind}>
                    <strong className="font-semibold">{line.strong}</strong>
                    {line.text}
                  </PermissionLine>
                ))}
              </PermissionList>
            </section>

            <p className="m-0 text-base text-ink-muted">{t.then}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
