import { DataSource } from 'typeorm';
import { Bank } from '../entities/bank.entity';

export const BANKS = [
    { name: 'Habib Bank Limited', code: 'HBL' },
    { name: 'United Bank Limited', code: 'UBL' },
    { name: 'National Bank of Pakistan', code: 'NBP' },
    { name: 'Meezan Bank Limited', code: 'MEEZAN' },
    { name: 'Faysal Bank Limited', code: 'FABL' },
    { name: 'Bank of Punjab', code: 'BOP' },
    { name: 'Bank of Khyber', code: 'BOK' },
    { name: 'Habib Metropolitan Bank', code: 'HMB' },
    { name: 'Standard Chartered Bank', code: 'SCBPL' },
    { name: 'Askari Bank Limited', code: 'ASKARI' },
    { name: 'MCB Bank Limited', code: 'MCB' },
    { name: 'Allied Bank Limited', code: 'ABL' },
    { name: 'Bank Alfalah Limited', code: 'ALFALAH' },
    { name: 'JS Bank Limited', code: 'JS' },
    { name: 'Soneri Bank Limited', code: 'SONERI' },
    { name: 'Samba Bank Limited', code: 'SAMBA' },
    { name: 'Silk Bank Limited', code: 'SILK' },
    { name: 'Summit Bank Limited', code: 'SUMMIT' },
    { name: 'BankIslami Pakistan Limited', code: 'BANKISLAMI' },
    { name: 'Dubai Islamic Bank Pakistan', code: 'DIB' },
    { name: 'Al Baraka Bank Pakistan', code: 'ALBARAKA' },
    { name: 'First Women Bank Limited', code: 'FWBL' },
    { name: 'Zarai Taraqiati Bank Limited', code: 'ZTBL' },
    { name: 'Sindh Bank Limited', code: 'SINDH' },
    { name: 'The Bank of Azad Jammu & Kashmir', code: 'BAJK' },
    { name: 'Industrial and Commercial Bank of China', code: 'ICBC' },
    { name: 'Citibank N.A. Pakistan', code: 'CITI' },
    { name: 'Deutsche Bank AG Pakistan', code: 'DEUTSCHE' },
    { name: 'JazzCash', code: 'JAZZCASH' },
    { name: 'Easypaisa Bank Limited', code: 'EASYPAISA' },
    { name: 'NayaPay', code: 'NAYAPAY' },
    { name: 'SadaPay', code: 'SADAPAY' },
];

export async function seedBanks(dataSource: DataSource) {
    const repo = dataSource.getRepository(Bank);

    console.log('🌱 Seeding banks...');

    let created = 0;
    let skipped = 0;

    for (const item of BANKS) {
        const existing = await repo.findOne({ where: { code: item.code } });

        if (existing) {
            skipped += 1;
            console.log(`⏭ Bank already exists: ${item.code} (${item.name})`);
            continue;
        }

        await repo.save(repo.create({ name: item.name, code: item.code }));
        created += 1;
        console.log(`✅ Bank created: ${item.code} (${item.name})`);
    }

    console.log(
        `🌱 Banks seeding completed. created=${created}, skipped=${skipped}\n`,
    );
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { bootstrapSeeder } = require('./run-seeder');
    bootstrapSeeder('Banks', seedBanks);
}
