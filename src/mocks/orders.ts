import { faker } from "@faker-js/faker"
import type { Order, Status } from "@/features/orders/columns"
import type { QueueOrder, QueueStatus } from "@/features/orders/modal-columns"

const customers = ['Acme Corp', 'Globex Inc', 'Initech', 'Umbrella Co', 'Stark Industries', 'Wayne Enterprises', 'Hooli', 'Soylent Corp', 'Cyberdyne Systems', 'Oscorp', 'Tyrell Corp', 'Pied Piper', 'Massive Dynamic', 'Aperture Science', 'Black Mesa', 'Weyland-Yutani', 'Rekall Inc', 'Nakatomi Trading', 'Gekko & Co', 'Dunder Mifflin', 'Wonka Industries', 'Vandelay Imports', 'Bluth Company', 'Los Pollos Hermanos', 'Spacely Sprockets'];
const products = ['Pro Plan License', 'Mechanical Keyboard', 'Onboarding Consultation', 'Annual Support Plan', '4K Monitor 27"', 'Analytics Add-on', 'Team Plan License', 'Accessibility Audit', 'Wireless Mouse', 'API Rate Tier', 'Storage Upgrade', 'Integration Setup', 'Enterprise Plan License', 'USB-C Docking Station', 'Security Hardening Review', 'Cloud Backup Tier', 'Noise-Cancelling Headset', 'Starter Plan License', 'Quarterly Tax Review', 'Webcam 1080p', 'Priority Support Tier', 'Data Migration Service', 'Mechanical Switch Pack', 'Growth Plan License', 'Ergonomic Office Chair'];
const categories = ['Software', 'Hardware', 'Services', 'Subscription'];
const channels = ['Online', 'Retail', 'Partner', 'Phone'];
const statuses: Status[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const queueStatuses: QueueStatus[] = ['queued', 'processing', 'ready', 'delivered'];
const regions = ['North America', 'Europe', 'Asia Pacific', 'LATAM', 'EMEA'];
const payments = ['Credit Card', 'PayPal', 'Bank Transfer', 'Crypto'];
const priorities = ['High', 'Medium', 'Low'];

export const generateOrders = (count = 100): Order[] => {
  return Array.from({ length: count }).map(() => {
    const hr = faker.number.int({ min: 8, max: 17 });
    const min = faker.number.int({ min: 0, max: 5 }) * 10;
    
    return {
      id: faker.string.uuid(),
      date: faker.date.recent({ days: 30 }).toISOString().split('T')[0],
      customer: faker.helpers.arrayElement(customers),
      product: faker.helpers.arrayElement(products),
      category: faker.helpers.arrayElement(categories),
      time: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')} - ${String(hr + 1).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      code: `ORD-${faker.string.alphanumeric({ length: 5, casing: 'upper' })}`,
      status: faker.helpers.arrayElement(statuses),
      channel: faker.helpers.arrayElement(channels) as "Online" | "Retail" | "Partner" | "Phone",
      quantity: faker.number.int({ min: 1, max: 20 }),
      amount: Number.parseFloat(faker.finance.amount({ min: 50, max: 5000, dec: 2 })),
      region: faker.helpers.arrayElement(regions),
      payment: faker.helpers.arrayElement(payments),
      priority: faker.helpers.arrayElement(priorities),
    };
  });
};

export const generateQueueOrders = (count = 12): QueueOrder[] => {
  return Array.from({ length: count }).map(() => {
    const hr = faker.number.int({ min: 8, max: 17 });
    const min = faker.number.int({ min: 0, max: 5 }) * 10;
    
    return {
      id: faker.string.uuid(),
      time: `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')} - ${String(hr + 1).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
      code: `ORD-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}`,
      customer: faker.helpers.arrayElement(customers),
      status: faker.helpers.arrayElement(queueStatuses),
      channel: faker.helpers.arrayElement(channels) as "Online" | "Retail" | "Partner" | "Phone",
      agent: `${faker.person.firstName().charAt(0)}. ${faker.person.lastName()}`,
      priority: faker.datatype.boolean(),
    };
  });
};
