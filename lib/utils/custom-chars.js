import { inherits } from 'node:util';

export default class {
  constructor(api) {
    this.hapServ = api.hap.Service;
    this.hapChar = api.hap.Characteristic;
    this.uuids = {
      todayUsage: 'E966F001-079E-48FF-8F27-9C2605A29F52',
      monthUsage: 'E966F002-079E-48FF-8F27-9C2605A29F52',
      prevMonthUsage: 'E966F003-079E-48FF-8F27-9C2605A29F52',
    };

    const hapChar = this.hapChar;
    const uuids = this.uuids;

    this.TodayUsage = class TodayUsage extends hapChar {
      constructor() {
        super('Today Usage', uuids.todayUsage);
        this.setProps({
          format: api.hap.Formats.UINT32,
          perms: [api.hap.Perms.READ, api.hap.Perms.NOTIFY],
          unit: 'Gallons',
        });
        this.value = this.getDefaultValue();
      }
    };
    this.TodayUsage.UUID = uuids.todayUsage;

    this.MonthUsage = class MonthUsage extends hapChar {
      constructor() {
        super('Month Usage', uuids.monthUsage);
        this.setProps({
          format: api.hap.Formats.UINT32,
          perms: [api.hap.Perms.READ, api.hap.Perms.NOTIFY],
          unit: 'Gallons',
        });
        this.value = this.getDefaultValue();
      }
    };
    this.MonthUsage.UUID = uuids.monthUsage;

    this.PrevMonthUsage = class PrevMonthUsage extends hapChar {
      constructor() {
        super('Previous Month', uuids.prevMonthUsage);
        this.setProps({
          format: api.hap.Formats.UINT32,
          perms: [api.hap.Perms.READ, api.hap.Perms.NOTIFY],
          unit: 'Gallons',
        });
        this.value = this.getDefaultValue();
      }
    };
    this.PrevMonthUsage.UUID = uuids.prevMonthUsage;
  }
}
