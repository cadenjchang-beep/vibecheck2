import { and, eq, isNull } from 'drizzle-orm';
import type { Subject } from '@shared/constants';
import { toViewer } from '../http/context';
import { createSet } from '../services/sets';
import { db } from './client';
import { sets, users } from './schema';
import { SEED_USERS } from './demo';

interface SeedSet {
  title: string;
  description: string;
  subject: Subject;
  termLang: string;
  definitionLang: string;
  cards: Array<[term: string, definition: string]>;
}

const SAMPLE_SETS: SeedSet[] = [
  {
    title: 'Spanish: 30 essential verbs',
    description: 'The verbs that turn up in almost every Spanish conversation, with their most common meanings.',
    subject: 'languages',
    termLang: 'es',
    definitionLang: 'en',
    cards: [
      ['ser', 'to be (identity, origin, lasting traits)'],
      ['estar', 'to be (states, feelings, location)'],
      ['tener', 'to have'],
      ['hacer', 'to do, to make'],
      ['poder', 'to be able to, can'],
      ['decir', 'to say, to tell'],
      ['ir', 'to go'],
      ['ver', 'to see'],
      ['dar', 'to give'],
      ['saber', 'to know (facts, how to do something)'],
      ['conocer', 'to know (people, places), to be familiar with'],
      ['querer', 'to want, to love'],
      ['llegar', 'to arrive'],
      ['pasar', 'to pass, to happen, to spend (time)'],
      ['deber', 'must, should; to owe'],
      ['poner', 'to put, to place'],
      ['parecer', 'to seem'],
      ['quedar', 'to stay, to remain'],
      ['creer', 'to believe'],
      ['hablar', 'to speak, to talk'],
      ['llevar', 'to carry, to wear, to take along'],
      ['dejar', 'to leave (something), to let'],
      ['seguir', 'to follow, to continue'],
      ['encontrar', 'to find'],
      ['llamar', 'to call'],
      ['venir', 'to come'],
      ['pensar', 'to think'],
      ['salir', 'to leave, to go out'],
      ['volver', 'to return, to come back'],
      ['tomar', 'to take, to drink'],
    ],
  },
  {
    title: 'Cell biology: organelles and their functions',
    description: 'Structures found in eukaryotic cells and what each one does. Covers plant and animal cells.',
    subject: 'science',
    termLang: 'en',
    definitionLang: 'en',
    cards: [
      ['nucleus', 'Membrane-bound organelle that holds the cell\'s DNA and controls gene expression'],
      ['nucleolus', 'Dense region inside the nucleus where ribosomal RNA is made and ribosome subunits are assembled'],
      ['ribosome', 'Molecular machine that builds proteins by translating messenger RNA'],
      ['rough endoplasmic reticulum', 'Network of membranes studded with ribosomes; folds and modifies proteins destined for export or membranes'],
      ['smooth endoplasmic reticulum', 'Membrane network without ribosomes; makes lipids, stores Ca<sup>2+</sup> and detoxifies drugs'],
      ['Golgi apparatus', 'Stack of flattened sacs that modifies, sorts and packages proteins and lipids for delivery'],
      ['mitochondrion', 'Site of aerobic respiration; produces most of the cell\'s <b>ATP</b> from glucose and O<sub>2</sub>'],
      ['chloroplast', 'Site of photosynthesis in plants and algae; converts light, CO<sub>2</sub> and H<sub>2</sub>O into glucose and O<sub>2</sub>'],
      ['lysosome', 'Vesicle of digestive enzymes that breaks down worn-out organelles, food particles and pathogens'],
      ['peroxisome', 'Small organelle that breaks down fatty acids and neutralises hydrogen peroxide (H<sub>2</sub>O<sub>2</sub>)'],
      ['central vacuole', 'Large fluid-filled sac in plant cells that stores water and nutrients and maintains turgor pressure'],
      ['cytoskeleton', 'Network of protein filaments that gives the cell its shape and moves organelles and vesicles'],
      ['centrosome', 'Region near the nucleus that organises microtubules and forms the spindle during cell division'],
      ['cell membrane', 'Phospholipid bilayer with embedded proteins that controls what enters and leaves the cell'],
      ['cell wall', 'Rigid outer layer of plant, fungal and bacterial cells that provides support and protection'],
      ['cytoplasm', 'Everything inside the cell membrane except the nucleus: the cytosol plus the organelles suspended in it'],
      ['vesicle', 'Small membrane-bound sac that transports materials within the cell or to the cell surface'],
      ['chromatin', 'DNA wrapped around histone proteins; the form genetic material takes when the cell is not dividing'],
    ],
  },
  {
    title: 'Cloud computing fundamentals (certification prep)',
    description: 'Core vocabulary shared by entry-level cloud certifications, independent of any one provider.',
    subject: 'test-prep',
    termLang: 'en',
    definitionLang: 'en',
    cards: [
      ['IaaS (Infrastructure as a Service)', 'Rented virtual servers, storage and networking; you manage the operating system and everything above it'],
      ['PaaS (Platform as a Service)', 'A managed platform for running your code; the provider handles servers, operating system and runtime'],
      ['SaaS (Software as a Service)', 'Complete applications delivered over the internet and managed entirely by the provider'],
      ['region', 'A geographic area containing several isolated data-centre locations'],
      ['availability zone', 'One or more data centres within a region with independent power, cooling and networking'],
      ['elasticity', 'Automatically adding and removing resources to match demand as it changes'],
      ['scalability', 'The ability of a system to handle growth by adding resources, vertically or horizontally'],
      ['high availability', 'Designing a system so it keeps running through component failures, usually measured in "nines" of uptime'],
      ['fault tolerance', 'The ability to keep operating with no interruption at all when a component fails'],
      ['shared responsibility model', 'The provider secures the cloud itself; the customer secures what they put in it'],
      ['CapEx vs OpEx', 'Up-front spending on owned hardware versus pay-as-you-go spending on consumed services'],
      ['virtual machine', 'A software emulation of a physical computer running its own operating system on shared hardware'],
      ['container', 'A lightweight package of an application and its dependencies that shares the host\'s kernel'],
      ['serverless', 'Running code without provisioning servers; you are billed only while the code executes'],
      ['object storage', 'Storage for whole files (objects) addressed by key, built for durability and massive scale'],
      ['block storage', 'Raw storage volumes attached to a server like a disk, suited to databases and file systems'],
      ['CDN (content delivery network)', 'A network of edge locations that caches content close to users to reduce latency'],
      ['load balancer', 'Distributes incoming traffic across several targets and stops sending it to unhealthy ones'],
      ['IAM (identity and access management)', 'The service that controls who is authenticated and what they are authorised to do'],
      ['principle of least privilege', 'Granting only the permissions needed to perform a task, and nothing more'],
      ['encryption at rest', 'Protecting stored data by encrypting it on disk'],
      ['encryption in transit', 'Protecting data as it moves across a network, typically with TLS'],
      ['RTO (recovery time objective)', 'The maximum acceptable time to restore a service after an outage'],
      ['RPO (recovery point objective)', 'The maximum acceptable amount of data loss, measured as time since the last recovery point'],
    ],
  },
];

/** Three public sample sets owned by the demo teacher. Safe to run repeatedly. */
export async function seedContent(): Promise<void> {
  const [teacher] = await db.select().from(users).where(eq(users.email, SEED_USERS.teacher.email)).limit(1);
  if (!teacher) return;
  const viewer = toViewer(teacher);
  for (const sample of SAMPLE_SETS) {
    const [existing] = await db
      .select({ id: sets.id })
      .from(sets)
      .where(and(eq(sets.ownerId, teacher.id), eq(sets.title, sample.title), isNull(sets.deletedAt)))
      .limit(1);
    if (existing) continue;
    await createSet(viewer, {
      title: sample.title,
      description: sample.description,
      subject: sample.subject,
      termLang: sample.termLang,
      definitionLang: sample.definitionLang,
      visibility: 'public',
      cards: sample.cards.map(([term, definition]) => ({ term, definition })),
    });
  }
}
