// Everyday tasks — the articles field workers use most: journals, hazard
// assessments, inspections, incidents, corrective actions, the truck log,
// forms, compliance, the feed, and field tools. Grounded in the real UI —
// keep the bolded labels in sync with those pages.

import type { ManualArticle } from '../types'
import { CSV_EXPORT_LIMIT_GUIDANCE } from './_shared'

export const FRONTLINE_ARTICLES: ManualArticle[] = [
  {
    slug: 'journals',
    title: 'Daily journals',
    group: 'Everyday tasks',
    iconKey: 'journal',
    summary: 'Write a daily log of your work, add photos, and submit it.',
    keywords: [
      'journal',
      'daily log',
      'diary',
      'site diary',
      'daily report',
      'log book',
      'notes',
      'photos',
      'tags',
      'voice',
      'dictate',
    ],
    body: `Your journal is a daily record of what happened on the job: work done, hazards spotted, visitors, weather, anything worth remembering.

## What this is for

A journal entry protects you and your crew. If a question comes up months later, your entry shows what happened that day. Supervisors also read journals to stay on top of site conditions.

## Where to find it

Open **Journals** in the left menu. The page opens on your most recent entry. On a desktop your past entries sit in a list on the left. On a phone, tap **Browse** to see them.

Journal managers can tap **Browse**, then **Manage journals**, on a phone. The Manage hub contains company records, tags, and automations.

## Writing today's entry

1. Open [Journals](/journals).
2. Tap **New entry**. An entry for today opens.
3. Type what happened. Your words save automatically as you go — there is no save button.
4. Use the microphone button to dictate by voice instead of typing, if you prefer.
5. Set the location and people in the bar above the text, if they apply.

The header changes from **Saving…** to **Saved** after your latest edit is stored. If it shows **Not saved — retry**, tap that message before leaving or submitting the entry.

## Using AI writing help

1. Tap the **AI** button in the journal editor.
2. Choose the writing action you want.
3. For a long entry, select the part you want changed first. AI writing help accepts up to 8,000 characters at a time.

BeaconHS leaves your original words in place until the AI response finishes. If the request fails, your journal is not changed.

## Adding photos

1. Scroll to the **Photos** section under the text.
2. Tap **Take photo or upload**. Take a new photo or choose one or more pictures from your phone's photo library.
3. Tap the pencil button to add a caption or draw attention to something in the photo. The editor keeps the photo's original shape while you work. Large camera photos are optimized automatically when they upload.
4. To remove a photo, tap the trash button on it.
5. Use the left and right arrow buttons to put several photos in the order you want.

Older imported entries can also show an **Attached files** list below the photos. Tap a file name to open or download the original PDF or email file.

## Tags

Tags help people find entries later (for example a tag for concrete pours). Tap the **Tags** chip in the bar above the text to add or change up to 20 tags. If your company has AI assist turned on, tags are often added for you.

## Submitting

1. When your entry is done, tap **Submit** at the top.
2. Submitted entries are shared with the people allowed to see them. Until then the entry is a draft only you can see.

## Viewing past entries

1. Open [Journals](/journals). On a phone, tap **Browse**.
2. Entries are grouped by date. Tap one to open it.
3. Tap **Drafts** in the list to see entries you have not submitted yet.
4. If you have a long history, tap **Load older entries** at the bottom to bring in the next group. Nothing is silently left out.

If your role can browse other people's journals, open **Records**. Use **All authors**, **All locations**, and **Any tag** to search the complete set of filter values used by journals you are allowed to open. If a picker says more results exist, add more of the person's name, location, or tag.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Write your entry through the day, not from memory at quitting time. It autosaves, so short visits are fine.
- A photo of a hazard is worth a paragraph. Add both.
- If you missed a day, pick that date in the list to create an entry for it.`,
  },
  {
    slug: 'hazard-assessments',
    title: 'Risk assessments',
    group: 'Everyday tasks',
    iconKey: 'radiation',
    summary: 'Find a reusable template or manage a property risk assessment.',
    keywords: [
      'JSA',
      'JSHA',
      'FLHA',
      'FLRA',
      'hazard card',
      'tailgate',
      'hazard assessment',
      'job safety analysis',
      'field level',
      'risk',
      'risk rating',
      'controls',
      'sign on',
      'signature',
      'PPE',
    ],
    body: `Risk Assessments is the current place to prepare and manage property-specific assessments. Each adopted template creates an editable draft; a template is not a completed or approved assessment.

## Where to find it

Open [Available Templates](/hospitality/risk?view=templates) to search, filter and preview Uvanoo or tenant templates. Choose **Use Template** or **Adopt & Amend**, then select the property and complete the draft.

Open [Property Risk Assessments](/hospitality/risk?view=assessments) to find assessments already created for an authorised property. Select the property, then open an assessment to edit hazards and controls, review it, manage actions or export its PDF.

## Assessment content

For each hazard, record who may be exposed, the potential harm, existing controls and any further controls or corrective actions. Set likelihood and severity using the property's configured risk matrix. Review residual risk after the additional controls are in place.

Templates are starting points. A competent assessor must check the actual property, work and people at risk, then complete review and approval using the application's available workflow.

## Historical Hazard Identification records

The separate legacy Hazard Assessments workflow has been retired. Existing historical records, audit evidence, corrective-action links and database tables are retained; this does not convert them into Risk Assessments or change their historical content.`,
  },
  {
    slug: 'inspections',
    title: 'Site inspections',
    group: 'Everyday tasks',
    iconKey: 'clipboard',
    summary: 'Run a checklist inspection, flag failures, and submit the record.',
    requiredPermission: 'inspections.read.self',
    keywords: [
      'inspection',
      'checklist',
      'audit',
      'walkdown',
      'walk down',
      'site check',
      'deficiency',
      'pass fail',
      'punch list',
      'findings',
    ],
    body: `An inspection is a checklist you walk through on site. Items can ask for **Pass** / **Fail** / **N/A**, **Yes** / **No**, or one answer from a company-defined list. Failures capture what was wrong and what was done about it.

## What this is for

Regular inspections catch unsafe conditions before they hurt someone. The record proves the check happened and tracks anything found.

## Where to find it

Open **Site Inspections** in the left menu. Records live at [Inspection records](/inspections/records).

On **Inspection records**, use **All inspection types**, **All locations**, and **All inspectors** to search across the records you are allowed to open. The **Location** column shows the selected company location. If a picker says more results exist, add more of the type, location, inspector name, or email to the search.

Inspecting a unit or tool instead of a site? Those live separately — see [Equipment checks](/help/equipment-inspections).

## Starting an inspection

1. Tap **New inspection**.
2. Use the search box to find the inspection type and tap it. The list shows how many checks each type has.
3. A new draft record opens. Choose the **Location**, enter the more specific **Location on site**, then fill in the foreman and notes. Fields save as you go.

## Answering the criteria

1. Work down the list. Tap **Pass**, **Fail**, or **N/A** on each item. Some items use **Yes** / **No**. For **Select one**, pick the exact answer that applies. Other items ask for **Text**, **Long text**, or a **Number**; enter the requested value instead of a pass/fail result.
2. When you tap **Fail**, extra fields open on that item:
   - **Reason for non-compliance** — what is wrong.
   - **Action taken** — what was done to fix it.
   - A severity, and a person the finding is assigned to, if your company uses those.
3. Add photos on any failed item. Tap **Take photo or upload** to use the camera or choose pictures from your phone's photo library. Some items require a photo before you can submit — they show a **Photo** tag.
4. Tap the pencil button on a photo to add a caption or draw attention to a problem. The editor keeps the photo's original shape. Large camera photos are optimized automatically when they upload. Tap the trash button to remove the wrong photo. Use the arrow buttons to put several photos in order.
5. If most outcome items pass, tap **Mark unanswered as pass** in the **Status & workflow** section to fill those items in one tap. **Select one**, **Text**, **Long text**, and **Number** items are never filled by this shortcut; answer each one yourself. Only use the shortcut when you actually checked the items.
6. If a whole section does not apply to the job — for example hoisting checks on a day with no lifts — tap **Mark section N/A** in that section's header. It marks only the section's unanswered outcome items as **N/A**; items you already answered stay as they are. Like the record-wide shortcut, it never touches **Select one**, **Text**, **Long text**, or **Number** items, and items that require a photo or comment before submit can still block submission — N/A only excuses the photo requirement, so add the required comment to submit.

## Setting up checklist questions

Managers build inspection types under **Site Inspections** → **Manage** → **Types**. Open a type, add or edit a question, then choose its **Response type**. Use **Text** for a short answer, **Long text** for a narrative, or **Number** when the answer must be numeric. For **Select one**, enter at least two unique **Options (one per line)**. New inspections copy the response type and options into the record, so changing the type later does not rewrite an inspector's saved answer contract. Reusable banks use the same question editor under **Banks**.

## Draft vs submitted

A record stays a draft while you work — you can leave and come back. When every item is answered:

1. Tap **Submit & lock** in the header and confirm. This submits the inspection, runs its submit flows, and makes it read-only in one step.
2. If the inspection should stay editable after submission, open **Status & workflow**, choose **Submitted**, and tap **Update status** instead.
3. Choosing **Closed** also submits and locks the inspection. Every submission path requires all required answers, comments, photos, and signatures.

If an edit removes required information from a submitted record, it returns to **In progress**. Complete the missing item and submit it again.

To correct a locked or closed record, tap **Unlock** and confirm. A closed record reopens as **Submitted** so you can make the correction. Tap **Resubmit & lock** when you are done; this locks the revised record and runs its submit flows again.

## Record actions

Use the buttons in the header to **Print / PDF**, **Send email**, **Copy inspection**, lock, unlock, or delete an inspection. On a phone, keep the lock button visible and tap **More actions** for the rest.

- **Copy inspection** starts a new draft with the same setup and checklist. Answers, photos, signatures, approvals, and corrective-action history are not copied. The button reads **Copying…** while the new draft is built, then opens it — tap it once and wait.
- **Send email** sends the inspection summary and saved checklist only to the addresses you enter.
- **Delete** is available to inspection managers. Confirm it carefully; the record leaves operational lists, while its audit history is retained.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Answer items as you walk, on your phone. Everything saves instantly.
- A failed item with a photo and a clear reason gets fixed faster than a vague note.
- Failures can turn into follow-up work. See [Corrective actions](/help/corrective-actions).`,
  },
  {
    slug: 'incidents',
    title: 'Reporting an incident',
    group: 'Everyday tasks',
    iconKey: 'alert',
    summary: 'Report injuries, near misses, property damage, and spills — fast.',
    keywords: [
      'incident',
      'injury',
      'accident',
      'near miss',
      'near-miss',
      'close call',
      'first aid',
      'property damage',
      'spill',
      'environmental',
      'report',
      'investigation',
    ],
    body: `Report every incident: injuries, illnesses, near misses, property damage, environmental spills, and security events. If it went wrong — or almost went wrong — it belongs here.

## What this is for

Near misses are free lessons. A close call reported today can stop an injury next month. Reporting is not about blame; it is how the company finds and fixes hazards.

## Where to find it

Open **Incidents** in the left menu, or go to [Incidents](/incidents).

## Reporting an incident

1. Tap **Report incident**.
2. Pick the **Type**: injury, illness, near miss, property damage, environmental, or security.
3. Pick the **Severity**. For a near miss with no one hurt, pick no injury.
4. Set **Occurred at** (date and time) and the **Location**.
5. Give it a short **Title**, like "Slip on wet floor near pump 3".
6. In **Description**, write what happened: who was there, what equipment was involved, what you saw.
7. Fill in **Immediate action taken** — first aid given, area barricaded, equipment locked out, and so on.
8. Record **External people involved**, **Witnesses**, and **Events leading up to incident** when known. Add a damage estimate and whether police were notified if relevant.
9. Tap **Submit report**.

Use the property switcher to report for the intended hotel. In Portfolio, choose the correct **Site** before submitting. The Incident list follows the selected property; Portfolio shows only your authorised properties.

The quick report captures the essentials. Photos, witness statements, and the full investigation happen on the incident's page after you submit. In **Photos**, tap **Take photo or upload** to use the camera or choose pictures from your phone's photo library. Tap the pencil button to add a caption or mark up a photo. The editor keeps the photo's original shape. Large camera photos are optimized automatically when they upload. Tap the trash button to remove the wrong photo, and use the arrow buttons to change the photo order before the incident is locked.

## What happens after

- The incident starts as **Reported**. The right people are notified automatically.
- An investigator may move it to investigating, dig into the causes, and record findings on the incident page.
- Fixes get assigned as [corrective actions](/help/corrective-actions) with owners and due dates.
- Move the investigation to **Pending review** before closing it. The status menu shows the available next steps. A closed incident must be **Reopened** before it returns to investigation.

You can open your own reports any time from the [Incidents](/incidents) list to see their status.

## Recording the investigation

If your role can investigate incidents, open the incident's **Investigation** section.

1. Use **Add event** to rebuild the timeline in order.
2. Use **Add factor** to record each contributing factor and its category, such as equipment, procedure, training, environment, or human.
3. Record the root cause and add the **Why** steps that led to it.
4. Use **Add step** under **Preventative steps** for each change that will stop the incident from happening again. Assign an owner, target date, and status when known.
5. Use the pencil and trash buttons to correct or remove investigation rows before the incident is locked.

Only people with the incident-investigation permission see these controls. Closing the incident locks its investigation.

## Recording an injured person

If you can update the incident, open its **Injuries** section and:

1. Tap **Add injury**.
2. Pick the **Injured person**, or type a name if the person is not in the directory.
3. Under **Injury types**, search the managed list and select every type that applies. You can remove a selected type with its **Remove** button.
4. Enter the **Body part(s)** and **Hours worked prior** when known.
5. Use **Injury result / outcome** for what happened after the injury, such as "x-rays clear", "stitches required", or "modified duty assigned". Do not repeat injury types in this box.
6. Record the **Treatment details** and **Treated at facility**.
7. Tap **Add injury**. Use **Edit injury** later if the outcome or treatment changes.

Archived injury types stay visible on existing records but cannot be added to another injury.

## Incident setup and hours (managers)

If your role can manage Incidents, the **Manage** pages include **Classifications**, **Injury types**, and **Hours worked**.

- Use the search box and **Status** on classifications or injury types to find active or archived setup records. Use **Next** and **Prev** to move through the list.
- An injury can have more than one managed **Injury type**. A type that is already used is archived instead of permanently deleted, so historical records stay complete.
- To nest a classification, choose **+ Child** on an active top-level row. In **Parent**, type to find another active top-level classification. Archived rows cannot receive new children.
- On **Hours worked**, search by period, date, or site. Use **Site** to narrow the entries. The totals above the table follow the current search and filter.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Report first, get details later. A quick report now beats a perfect report tomorrow.
- Get first aid and make the area safe before touching the app. The report can wait a few minutes; a person cannot.
- When in doubt, report it. Nobody gets in trouble for reporting a near miss.`,
  },
  {
    slug: 'corrective-actions',
    title: 'Corrective actions',
    group: 'Everyday tasks',
    iconKey: 'list-checks',
    summary: 'Fixes assigned to you: what they are, doing the work, and closing them out.',
    keywords: [
      'corrective action',
      'CA',
      'action item',
      'follow up',
      'follow-up',
      'punch list',
      'fix',
      'deficiency',
      'due date',
      'overdue',
      'assigned to me',
      'close out',
    ],
    body: `A corrective action is a fix that came out of an incident, inspection, or hazard assessment — with an owner and a due date. If one is assigned to you, it is your job to do the work and record it.

## What this is for

Finding a problem only matters if someone fixes it. Corrective actions track each fix from "assigned" to "done and checked" so nothing falls through the cracks.

## Where to find it

Open **Corrective Actions** in the left menu, or go to [Corrective actions](/corrective-actions). The list opens on open actions. Each row shows the status and the due date — overdue ones are flagged. Use the search box and the status filter to narrow the list; tap **All statuses** to see closed ones too.

## Hotel property access

Hotel staff can open, change, search and export actions only for their assigned properties. Permission to read all actions means all permitted actions within those properties. Cluster managers can work across their assigned hotels. The Property Switcher narrows the Action list, reports and CSV export to the selected hotel. **Portfolio** shows your authorised properties together; it does not grant access to another hotel.

When creating a standalone action, choose its **Property**. Actions created from a property record retain that source's property. Choose an owner who has access to that hotel. If an older action has no verifiable property, it is hidden from property-limited users until an authorised administrator resolves its source. A shared photo link does not grant access to another hotel's action.

## Completing one assigned to you

1. Open the action from the list.
2. Read the **General** section so you understand what is being asked, and check the due date.
3. Do the work in the field.
4. In the **Work** section, fill in **Action taken** — what you actually did. Fields save as you type. Add the root cause if you know it.
5. Add photos of the finished fix in the **Photos** section. Tap **Take photo or upload** to use the camera or choose pictures from your phone's photo library. Tap the pencil button to add a caption or mark up a photo; the editor keeps the photo's original shape. Large camera photos are optimized automatically when they upload. Tap the trash button to remove the wrong one, and use the arrow buttons to put the photos in order.
6. Some actions have step-by-step items. Check each one off as you finish it.

## Verification and closing

- Some actions need a second person to verify the fix before they can close. The **Verification** section shows this — the verifier taps **Verify** and signs.
- To close, tap **Close + lock** at the top. You can add a cost figure and a close note. Closing locks the record so it becomes read-only.
- Made a mistake? Someone with access can tap **Reopen**.

## Due dates

The due date is on the row in the list and at the top of the action. Overdue actions are marked and show up in reports your supervisor sees. If you cannot make the date, say so early — do not let it quietly go overdue.

Supervisors can use the report tabs to work through larger backlogs. **Aging** filters open actions by age, severity, and status. **Overdue** searches all overdue actions and filters by severity, status, or whether an owner is assigned. **By assignee** finds owners with overdue or outstanding work, and **By source** shows which records create the most actions. Click a heading to change the sort order.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Write **Action taken** like you are explaining it to someone who was not there.
- A before-and-after photo pair tells the whole story.`,
  },
  {
    slug: 'vehicle-log',
    title: 'Vehicle / truck log',
    group: 'Everyday tasks',
    iconKey: 'wrench',
    summary: 'Log your monthly truck kilometres — by destination or by odometer.',
    keywords: [
      'truck log',
      'vehicle log',
      'mileage',
      'odometer',
      'kms',
      'km',
      'kilometres',
      'kilometers',
      'truck',
      'driving',
      'personal km',
      'business km',
      'month',
    ],
    body: `The vehicle log records the kilometres you drive a company truck each month. Each day gets one row.

## What this is for

The log splits business and personal kilometres so the company records are right at tax time, and shows which vehicle went where.

## Where to find it

Open **Equipment** in the left menu, then the **Vehicle log** tab — or go straight to [Vehicle log](/equipment/vehicle-log).

## Setting up your month

1. Tap **Choose driver** and pick yourself.
2. Tap **Choose vehicle** and pick your truck.
3. If your company allows both, pick a **Log mode**: **Destination** or **Odometer**.
4. Use the arrows to change months. **This month** jumps back to today's month.

You now see the month grid — one row per day.

## Logging a day (odometer mode)

1. Find today's row.
2. Type the **End** odometer reading. You can skip **Start** — a blank start carries forward from the previous day's end, so you usually only type one number.
3. Type any **Personal km** for that day.
4. Tap out of the field. The row saves by itself — a checkmark shows when it is saved.

The **Total km** column and the month totals at the bottom update as you type.

## Logging a day (destination mode)

1. Find today's row.
2. Pick the **Customer / site** you drove to, or type an **Other destination**.
3. Type the business **Km** and any **Personal km**.
4. Tap out of the field to save.

## Quick fill

- Press Enter in a field to jump to the same field on the next day — you can run down the whole month fast.
- In odometer mode, leaving **Start** blank chains each day off the one before it.

## On a phone

The grid becomes a stack of day cards with big touch targets, one card per day, with the same fields. Fill them the same way.

## Annual summary

Open **Summary** to review vehicles across a year. Search by asset tag, name, category, or type. Use **Next** and **Prev** to move through the vehicle list; the totals row still covers every vehicle that matches the current search. Site-scoped roles only see vehicles at their assigned sites (plus equipment currently issued to them).

Open one saved entry and use its **Activity** tab when you need the change history. Search the history, filter by **Action**, choose the **Order**, and use **Next** and **Prev** to reach older events.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Settings for equipment managers

Open **Settings** from the vehicle log to choose which entry modes the company uses and the default mode. Under **Per-driver defaults**, search for an active driver, choose **Destination** or **Odometer**, then click **Set override**. Search the saved overrides or use **Mode** and **Order** to narrow the list. Use **Next** and **Prev** to review every saved override.

## Tips

- Tap **PDF** to get the printable monthly sheet for the selected driver and vehicle.
- Log daily. Rebuilding a month from memory is painful and usually wrong.`,
  },
  {
    slug: 'forms',
    title: 'Filling out forms',
    group: 'Everyday tasks',
    iconKey: 'clipboard-check',
    summary: 'Find, fill, and submit company forms like toolbox talks and lift plans.',
    keywords: [
      'form',
      'forms',
      'toolbox talk',
      'safety talk',
      'tailgate talk',
      'lift plan',
      'fill out',
      'submit',
      'signature',
      'paperwork',
      'checklist',
    ],
    body: `Your company builds its own digital forms in BeaconHS — toolbox talks, lift plans, permits, checklists, and more. You fill them in the app instead of on paper.

## What this is for

One place for all the paperwork. Nothing gets lost in a truck cab, and the office sees your form the moment you submit it.

## Where to find forms

- **Pinned forms** sit right in the left menu. Most companies pin **Toolbox talks** and **Lift plans** there, and may pin others.
- **Assigned forms** show up in your [Workspace](/my) and your Inbox when someone assigns one to you, and under [My compliance](/help/compliance) if it is required.

Only published forms allowed for the role you are currently using appear. If you switch roles, your pinned forms and available form records update with that role.

## Filling out a pinned form

1. Tap the form in the left menu — for example **Toolbox talks**. You land on the list of past entries.
2. Tap **New entry**. A fresh entry opens.
3. Search **Location** and choose the customer, project, site, or area where the form is being recorded. Hazard-assessment apps inherit the assessment's Location.
4. Fill in the fields. Your answers save as you go, so you can stop and come back.
   - Formatted descriptions save the newest text when you leave the field.
   - For a lift-plan diagram or other sketch, tap **Draw diagram** (or **Edit diagram** if one is already saved). Draw in the panel that opens, then tap **Save**. Tap **Clear** to remove the saved drawing. If your company set up **Symbols** on that diagram, tap a symbol to drop a ready-made part onto the canvas, then move it where it belongs. If **Draft with AI** is offered, describe the diagram in a few sentences and tap **Generate draft** — the AI inserts an editable starting point. Review and adjust everything yourself before saving; check every measurement and clearance.
5. Some forms ask for signatures — sign in the signature box, and pass the phone around if the whole crew signs.
6. Tap **Submit** when you are done. Some entries use a **Finalize** button instead — it does the same job: it marks the entry complete and locks it.

## Filling out an assigned form

1. Open your [Workspace](/my) or the notification you received.
2. Tap the assigned form to open it.
3. Fill it in and submit the same way.

## Finding a past entry

1. Tap the form in the left menu to open its entry list.
2. Use the search box and filters to find the entry, and tap it to open.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Required fields are marked. The form tells you what is missing when you try to submit.
- In a formatted-text field, pasted content is cleaned automatically. **Link** accepts a web address, email address, phone number, app path, or page anchor.
- In a **Risk matrix** field, tap where likelihood meets severity. The score and risk band appear above the grid. Tap the selected cell again to clear it.
- Linked record pickers search company data as you type. Large linked tables have their own search box and **Previous** and **Next** page buttons.
- Every Builder photo works the same way: tap **Take photo or upload** to use the camera or choose pictures from your phone's photo library. Tap the pencil button to add a caption or draw on a photo, tap the trash button to remove it, and use the arrow buttons to change the order. The editor keeps the photo's original shape while you work. Large camera photos are optimized automatically when they upload. Those edits and the saved order appear in the record PDF. If AI review is available, changing the set or order of photos clears the old review so you can run it again.
- For a toolbox talk, add everyone who attended before you submit — that is your attendance record.
- If a form you need is not in your menu, check that you are using the right role, then ask your supervisor. The form may need to be published, allowed for your role, pinned, or assigned to you.`,
  },
  {
    slug: 'compliance',
    title: 'My compliance',
    group: 'Everyday tasks',
    iconKey: 'check',
    summary: 'See everything assigned to you — training, forms, documents — and clear it.',
    keywords: [
      'compliance',
      'assigned to me',
      'my tasks',
      'requirements',
      'training due',
      'overdue',
      'acknowledge',
      'sign off',
      'certs',
      'tickets',
      'expiring',
    ],
    body: `The compliance page is your personal to-do list of required items: training to take, forms to fill, documents to read and acknowledge, and sign-offs to complete.

## What this is for

Companies assign required items to roles and crews — a yearly training course, a monthly inspection, a policy to acknowledge. This page shows exactly what is on your plate and when it is due, so nothing sneaks up on you.

## Where to find it

Open **Compliance** in the left menu, or go to [Compliance](/compliance). Most people land straight on the **Mine** tab — your own items. Supervisors also see extra tabs for the whole team.

## Reading the page

- The bar at the top shows your progress — how many items are done out of the total.
- The **My compliance** dashboard card keeps recurring journals, inspections, and apps visible for the current period, including completed work. Each row shows the completed and expected count plus the period dates.
- Document acknowledgements appear in the **Documents** summary below current-period work. Tap it to open the document-filtered list.
- Each row is one obligation. The **Due** column shows the deadline; overdue items are flagged.
- The **Completed** column shows when you finished it.
- Use the search box or the **Status** and **Kind** filters when your list is long. Click a heading to sort it.

## Clearing an item

1. Open [Compliance](/compliance).
2. Find a row that is not done. The button on the row tells you what to do — it changes with the kind of item:
   - **Acknowledge** — open the document reader, read the PDF, and confirm.
   - **Go to training** — opens the assigned course or assessment. Start an assessment from this link so the result is credited to that exact requirement.
   - **Open app** — opens the form linked to that exact obligation. Submit it from this link so the required item is recorded as complete.
   - **Start inspection** — starts the required inspection.
   - **New assessment** — starts the required hazard assessment.
   - **Log entry** — opens your journal.
   - **Sign off** — records a required sign-off.
3. Finish the task. The row updates to completed on its own.
4. Rows that are done show **Review** so you can look back at what you submitted.

Opening the same app from the general Builder gallery creates an on-demand entry. It does not clear a scheduled obligation; always start required apps from **Compliance** → **Mine**.

## Tips

- Check this page once a week. Clearing items early beats explaining overdue ones.
- Recurring items come back on schedule — a monthly item reappears every month. That is normal.
- If an item looks wrong (not your job, wrong site), tell your supervisor instead of ignoring it.`,
  },
  {
    slug: 'feed',
    title: 'Activity feed',
    group: 'Everyday tasks',
    iconKey: 'rss',
    summary: 'A live timeline of recent journals, incidents, assessments, and forms.',
    keywords: [
      'feed',
      'activity',
      'timeline',
      'recent',
      'what happened',
      'news',
      'updates',
      'stream',
    ],
    body: `The feed is a running timeline of recent activity across the company: journal entries, incidents, corrective actions, hazard assessments, and form submissions.

## What this is for

It answers "what happened lately?" without opening five different pages. Start your morning here to catch up on yesterday — a new incident on your site, an inspection on your equipment, a journal from another crew.

## Where to find it

Open **Feed** in the left menu, or go to [Feed](/feed).

## Reading the feed

1. Newest items are at the top, grouped by day.
2. Each card shows who did what, and where. Tap a card to open the full record.
3. Scroll down to load older items.

You only see records you are allowed to see. Two people can open the feed and get different timelines — that is by design.

## Filtering

1. Use the filter pills at the top: **All**, **Journal**, **Incident**, **Corrective action**, **Hazard assessment**, **App**.
2. Tap a pill to show only that kind of activity. The counts on the pills show the last 7 days.
3. Tap **All** to clear the filter.

On a desktop, a summary rail on the side shows the same counts at a glance.

## What the kinds mean

- **Journal** — daily log entries. See [Daily journals](/help/journals).
- **Incident** — reported incidents and near misses. See [Reporting an incident](/help/incidents).
- **Corrective action** — fixes being assigned and closed. See [Corrective actions](/help/corrective-actions).
- **Hazard assessment** — JSHAs and FLHAs. See [Hazard assessments](/help/hazard-assessments).
- **App** — submissions of company forms like toolbox talks. See [Filling out forms](/help/forms).

## Tips

- The feed is read-only. To act on something, tap through to the record itself.
- If the feed looks quiet, it may just mean your access is scoped to your own records. Ask your supervisor if you think you should see more.`,
  },
  {
    slug: 'hotel-handover',
    title: 'Hotel Handover',
    group: 'Everyday tasks',
    iconKey: 'journal',
    summary: 'Record, acknowledge, update, and carry forward property shift handovers.',
    keywords: ['hotel handover', 'shift', 'handover', 'follow-up', 'acknowledge', 'carry forward'],
    requiredPermission: 'hospitality.read',
    body: `Hotel Handover is the chronological shift record for operational notes that the next team needs to see. Entries stay attached to their property and can be acknowledged, updated, carried forward, and linked to follow-up work.

## Where to find it

Open **Hotel Handover** in the left menu. The Global Property selector controls the feed: choose one hotel for its handover, or use the portfolio view when your role can access several properties.

## Add a handover entry

1. Choose the property, date and time, shift, department, and priority.
2. Write the handover note. Add a room or location when it helps the next shift find the issue.
3. Mark **Follow-up required** and choose an owner when somebody must act.
4. Link an existing maintenance issue, or create a shared Corrective Action when formal tracking is needed.
5. Save the entry, then add secure photos if they provide useful evidence.

## Work the feed

- Tap **Acknowledge** to show that you have read an entry.
- Add an update instead of replacing the original note; this preserves the handover history.
- Change follow-up status as work moves from open to in progress or completed.
- Carry forward an unresolved important or urgent entry when it must remain visible to the next shift.
- Use search to find notes by property, department, location, or note text.

You only see properties authorised for your role. Hotel managers remain within their assigned hotel; cluster and regional roles can work across their authorised properties.`,
  },
  {
    slug: 'metering',
    title: 'Metering',
    group: 'Everyday tasks',
    iconKey: 'chart',
    summary: 'Configure utility meters, enter readings, and review consumption and estimated cost.',
    keywords: ['metering', 'electricity', 'gas', 'water', 'MPAN', 'serial number', 'tariff'],
    requiredPermission: 'hospitality.read',
    body: `Metering keeps utility readings and estimated expenditure attached to the correct hotel.

## Where to find it

Open **Metering** in the left menu. Use the one Metering workspace for Overview, Enter Reading, History, Analytics, and Setup.

## Enter a reading

1. Choose the meter. Its name, Serial Number, MPAN where applicable, location, and unit are shown.
2. Enter the reading value and date/time.
3. Use **Meter reset** when the physical counter restarts; never enter a lower normal reading.
4. Use **Correction** to replace a specific mistaken reading while retaining audit history.

## Setup and tariffs

Setup is manager-only. Managers configure meters, replacements, lifecycle status, and effective-dated tariffs. A reading stores the tariff and estimated expenditure that applied at that time, so later tariff changes do not rewrite history.

The Global Property selector controls the visible property or authorised portfolio. Server-side property access remains authoritative.`,
  },
  {
    slug: 'tools',
    title: 'Field tools',
    group: 'Everyday tasks',
    iconKey: 'wrench',
    summary: 'Open field calculators and company-published utilities available to your role.',
    keywords: ['tools', 'calculator', 'utilities', 'company tools', 'custom tools'],
    requiredAnyPermission: ['tools.safe-distance.use', 'forms.response.create'],
    body: `The Tools page collects standalone calculators and company-published utilities — small helpers that do one field job well.

## What this is for

Some field math is too important to do on a napkin. Tools give you a tested calculator that also keeps a record of the answer, so the numbers you acted on are saved.

## Where to find it

Open **Tools** in the left menu, or go to [Tools](/tools). Each tool is a card — tap one to open it.

## Company-published tools

Your company can build its own tools and publish them here. Those appear as extra cards on the same page — tap one and fill it in like a form. What you see depends on what your company has published.

## Tips

- Follow the labels and required fields inside each tool. Company tools can have different steps.
- If a tool you expect is missing, ask your admin — company tools have to be published before they show up.`,
  },
  {
    slug: 'safe-distance',
    title: 'Safe Distance pressure-test calculator',
    group: 'Everyday tasks',
    iconKey: 'wrench',
    summary: 'Calculate, save, lock, and print pneumatic pressure-test stand-off distances.',
    keywords: [
      'safe distance',
      'pressure test',
      'pneumatic test',
      'stand off',
      'standoff',
      'exclusion zone',
      'NASA',
      'ASME',
      'Lloyds',
    ],
    requiredPermission: 'tools.safe-distance.use',
    body: `**Safe Distance** works out the stand-off distance for a pneumatic pressure test — how far people must stay from piping under test. It uses NASA-Glenn, ASME PCC-2, and Lloyd's Register calculations and keeps the assessment as a safety record.

## Start an assessment

1. Open [Tools](/tools) and tap **Safe Distance**.
2. Tap **New assessment**.
3. Enter the system name and test pressure.
4. Tap **Add pipe** for each pipe segment. Enter its length, inside diameter, and unit.
5. Choose the governing calculation method.
6. Add the site, supervisor, operator, and notes when they apply.
7. Tap **Save calculation**.

The server calculates the result again when you save. This prevents a changed browser value from becoming the official result.

## Review and lock the record

The result shows all three calculated distances. Use the method required by your test plan and confirm the exclusion zone with the responsible supervisor.

Tap **Lock** after the values have been checked. A locked assessment cannot be edited or deleted. Tap **Unlock** before making an approved correction.

If somebody changes or locks the assessment while you have it open, refresh the page before trying again. The app will not overwrite the newer record.

## Print or save a PDF

Open the assessment and tap **Print / PDF**. Use your browser's print window to print it or save it as a PDF. Past assessments remain in the Safe Distance list.

${CSV_EXPORT_LIMIT_GUIDANCE}

## Tips

- Double-check pressure, pipe length, inside diameter, and units against the approved test plan.
- Add every connected pipe segment before relying on the result.
- If **Safe Distance** is missing, ask an administrator to grant **Use Safe Distance**.`,
  },
]
