import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const STATUS_DEFS = [
  { name: 'To Do', color: '#c89642' },
  { name: 'In Progress', color: '#618cd1' },
  { name: 'Review', color: '#9a61d1' },
  { name: 'Done', color: '#349f7c' },
]

async function main() {
  console.log('🌱 Starter seeding av Siqt testmiljø...')

  // Tøm eksisterende data (rekkefølge pga. relasjoner)
  await prisma.task.deleteMany()
  await prisma.user.deleteMany()
  await prisma.list.deleteMany()
  await prisma.folder.deleteMany()
  await prisma.space.deleteMany() // cascader Status + CustomField
  await prisma.workspace.deleteMany()

  // 1 Workspace
  const workspace = await prisma.workspace.create({
    data: { name: 'Local Dev Workspace' },
  })

  // 2 Spaces — statuser opprettes nå som egne Status-rader med farge, ikke en kommastreng
  const productDev = await prisma.space.create({
    data: {
      name: '🚀 Product Dev',
      color: '#618cd1',
      workspaceId: workspace.id,
      statuses: {
        create: STATUS_DEFS.map((s, idx) => ({ ...s, order: idx })),
      },
    },
    include: { statuses: true },
  })

  const marketing = await prisma.space.create({
    data: {
      name: '🔥 Marketing',
      color: '#cd6565',
      workspaceId: workspace.id,
      statuses: {
        create: STATUS_DEFS.map((s, idx) => ({ ...s, order: idx })),
      },
    },
    include: { statuses: true },
  })

  // 3 Lister
  const frontendList = await prisma.list.create({
    data: { name: 'Frontend Sprint', spaceId: productDev.id },
  })

  const backendList = await prisma.list.create({
    data: { name: 'Backend Sprint & API', spaceId: productDev.id },
  })

  const q3Launch = await prisma.list.create({
    data: { name: 'Q3 Launch Campaign', spaceId: marketing.id },
  })

  // Team — noen ekte User-rader så assignee-velgeren har innhold med en gang
  console.log('👥 Oppretter testbrukere...')
  const rh = await prisma.user.create({ data: { name: 'Robin H.', initials: 'RH', color: '#6366F1' } })
  const co = await prisma.user.create({ data: { name: 'Casper O.', initials: 'CO', color: '#349f7c' } })
  const vs = await prisma.user.create({ data: { name: 'Vetle S.', initials: 'VS', color: '#c89642' } })

  const lister = [frontendList, backendList, q3Launch]
  const folk = [[rh], [co], [vs], [rh, co], []]

  const getDate = (daysOffset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + daysOffset)
    return d
  }

  // 25 Mock-oppgaver
  console.log('📦 Genererer 25 mock-oppgaver med tidsspenner...')
  for (let i = 1; i <= 25; i++) {
    const tilfeldigListe = lister[Math.floor(Math.random() * lister.length)]
    const spaceStatuses = tilfeldigListe.id === q3Launch.id ? marketing.statuses : productDev.statuses
    const tilfeldigStatus = spaceStatuses[Math.floor(Math.random() * spaceStatuses.length)].name
    const startOffset = Math.floor(Math.random() * 20) - 10
    const varighet = Math.floor(Math.random() * 5) + 1

    const erUnscheduled = i % 5 === 0
    const tilfeldigeAssignees = folk[Math.floor(Math.random() * folk.length)]

    const task = await prisma.task.create({
      data: {
        title: `Task #${100 + i}: ${i % 2 === 0 ? 'Implementere' : 'Verifisere'} funksjonalitet ${i}`,
        description: `Dette er en auto-generert beskrivelse for testoppgave ${i}. Støtter **Markdown** og sjekklister:\n- [ ] Sjekkliste punkt 1\n- [x] Fullført punkt`,
        status: tilfeldigStatus,
        priority: (i % 4) + 1,
        startDate: erUnscheduled ? null : getDate(startOffset),
        dueDate: erUnscheduled ? null : getDate(startOffset + varighet),
        listId: tilfeldigListe.id,
        assignees: { connect: tilfeldigeAssignees.map((u) => ({ id: u.id })) },
      },
    })

    // Legg til 2 subtasks på de første 5 hovedoppgavene
    if (i <= 5) {
      await prisma.task.create({
        data: {
          title: `↳ Subtask A for oppgave #${100 + i}`,
          status: 'To Do',
          listId: tilfeldigListe.id,
          parentId: task.id,
          assignees: { connect: [{ id: rh.id }] },
        },
      })
      await prisma.task.create({
        data: {
          title: `↳ Subtask B for oppgave #${100 + i}`,
          status: 'Done',
          listId: tilfeldigListe.id,
          parentId: task.id,
          assignees: { connect: [{ id: co.id }] },
        },
      })
    }
  }

  console.log('✅ Seeding fullført! Databasen er klar til bruk.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })