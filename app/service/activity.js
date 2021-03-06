/* eslint-disable array-bracket-spacing */
/* eslint-disable indent */
/*
 * @Author: lts
 * @Date: 2021-04-06 08:42:49
 * @LastEditTime: 2021-04-21 17:08:33
 * @FilePath: \teach-research-server\app\service\activity.js
 */
'use strict';

const Service = require('egg').Service;
const path = require('path');
const temp = `
            activity.id as id,
            activity.leader_id as leader_id,
            activity.content as content,
            activity.title as title,
            activity.place as place,
            activity.join_users as join_users,
            FROM_UNIXTIME(activity.start_time/1000,'%Y-%m-%d %H:%i:%s') as start_time,
            FROM_UNIXTIME(activity.end_time/1000,'%Y-%m-%d %H:%i:%s') as end_time,
            activity.advance as advance,
            activity.record_files as record_files,
            activity.files as files,
            user.name AS username,
            user.avatar as avatar,
            user.role_id as role_id,
            user.job_id as job_id,
            user.phone as phone,
            teach_room.id as room_id,
            teach_room.name as room_name
            from activity 
            left join user on  user.id=activity.leader_id  
            left join teach_room on  activity.room_id=teach_room.id  
        `;
const swiperWhitelist = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.wbmp',
    '.webp',
    '.svg',
];
function changeRet(ret) {
    ret.forEach(item => {
        const { leader_id, avatar, username, role_id, job_id, phone, room_id, room_name } = item;
        item.leader = {
            id: leader_id,
            name: username,
            avatar,
            role_id,
            job_id,
            phone,
        };
        item.room = {
            id: room_id,
            name: room_name,
        };
        delete item.leader_id;
        delete item.avatar;
        delete item.username;
        delete item.role_id;
        delete item.job_id;
        delete item.phone;
        delete item.room_id;
        delete item.room_name;
    });
}
class ActiveService extends Service {
    async findAll() {
        const { app } = this;
        // const ret = await app.mysql.select('activity', {
        //     orders: [[ 'create_time', 'desc' ]],
        // });
        const sql = `select ${temp} where advance=1 order by start_time desc`;
        const ret = await app.mysql.query(sql);
        if (ret[0]) {
            changeRet(ret);
        }
        return ret;
    }
    async getActivesByType({ type, current_page, page_size }) {
        const { app } = this;
        const time = Date.now();
        const start_num = (current_page - 1) * page_size;
        let ret = null;
        let sql = '';
        switch (type) {
            case 'will':
                sql = `select (select count(*) from activity where activity.start_time > ${time} and activity.advance=1 ) as total,
                ${temp} where start_time > ${time} and advance=1 
                order by start_time desc
                limit ${start_num}, ${page_size}
                `;
                break;
            case 'done':
                sql = `select
                (select count(id) from activity  where end_time <= ${time} and advance=1  ) as total,
                ${temp}  where end_time <= ${time} and advance=1 
                order by start_time 
                limit ${start_num}, ${page_size} 
                `;
                break;
            default:
                ret = '????????????????????????';
                break;
        }
        if (sql.length > 10) {
            ret = await app.mysql.query(sql);
            if (!ret) return { msg: '??????' };
            let total = 0;
            if (ret[0]) {
                total = ret[0].total;
                changeRet(ret);
                ret.forEach(item => {
                    delete item.total;
                });
            }

            return { act: ret, total };
        }
        return { error: ret };
    }
    async getActiveById(params) {
        let ret;
        let sql = '';
        if (params.id && params.type) {
            switch (params.type) {
                case 'act':
                    sql = `
                            select
                            ${temp}
                            where activity.id=${params.id}
                            `;
                    break;
                case 'room':
                    sql = `select ${temp}  where activity.room_id=${params.id}`;
                    break;

                default:
                    ret = '?????????????????????';
                    break;
            }
            if (sql.length > 10) {
                ret = await this.app.mysql.query(sql);
                if (params.type === 'act' && ret.length > 0) {
                    ret = ret[0];
                    const record_files = JSON.parse(ret.record_files || '[]');
                    const imgArr = [];
                    const otherArr = [];
                    record_files.forEach(item => {
                        if (swiperWhitelist.some(imgItem => path.extname(item.filePath) === imgItem)) {
                            imgArr.push(item);
                            return;
                        }
                        otherArr.push(item);
                        return;
                    });
                    const { leader_id, avatar, username, role_id, job_id, phone } = ret;
                    ret.leader = {
                        id: leader_id,
                        name: username,
                        avatar,
                        role_id,
                        job_id,
                        phone,
                    };
                    ret.record_imgs = imgArr;
                    ret.record_other = otherArr;
                    delete ret.leader_id;
                    delete ret.avatar;
                    delete ret.username;
                    delete ret.role_id;
                    delete ret.job_id;
                    delete ret.phone;
                    delete ret.advance;
                    delete ret.record_files;
                } else if (ret.length === 0) {
                    return {
                        msg: '????????????',
                    };

                }
                return ret;
            }
            return { error: ret };
        }
        return { error: '?????????????????????' };
    }
    // ????????????????????????
    async updateActiveById(activeInfo) {
        let { id, title, content, files, start_time, end_time, join_users, place } = activeInfo;
        join_users = JSON.parse(join_users || '[]');
        if (typeof join_users === 'string') {
            join_users = JSON.parse(join_users || '[]');
        }
        const sql = `
            update activity set
            title='${title}',
            content='${content}',
            files='${files}',
            place='${place}',
            join_users='${JSON.stringify(join_users)}',
            start_time='${start_time}',
            end_time='${end_time}' where id=${id} and advance=0
        `;
        const ret = await this.app.mysql.query(sql);
        // const ret = await this.app.mysql.update('active', row);
        if (ret.affectedRows === 1) {
            return {
                ...activeInfo,
                msg: '????????????',
            };
        }
        return {
            msg: '????????????',
        };
    }
    // ?????? ?????? ???????????? ??????
    async createActive(activeInfo) {
        const { title, content, files, start_time, leader_id, room_id, join_users, advance, place } = activeInfo;
        const ret = await this.app.mysql.insert('activity', {
            title,
            content,
            files,
            leader_id,
            join_users,
            room_id,
            place,
            start_time,
            end_time: start_time,
            advance,
        });
        if (ret.affectedRows === 1) {
            return {
                id: ret.insertId,
                ...activeInfo,
                room_id: parseInt(room_id),
                leader_id: parseInt(leader_id),
            };
        }
        return {
            msg: '??????',
        };
    }
    // ????????????????????????
    async deleteActiveById(id) {
        const { app } = this;
        const currInfo = await app.mysql.get('activity', { id });
        if (currInfo && currInfo.leader_id) {
            if (currInfo.advance === 0) {
                const ret = await app.mysql.delete('activity', { id: currInfo.id });
                if (ret.affectedRows === 1) {
                    return {
                        ...currInfo,
                        msg: '????????????',
                    };
                }
                return {
                    msg: '????????????',
                };
            }
            return {
                msg: '?????????????????????????????????????????????',
            };
        }
        return {
            msg: '????????????',
        };
    }
    // ????????????????????????????????????
    async getAdvanceByUserId() {
        const { ctx, app } = this;
        const { id, role_id } = ctx.state.user;
        if (role_id >= 2) {
            const ret = await app.mysql.select('activity', {
                where: {
                    leader_id: id,
                    advance: 0,
                },
                orders: [['start_time', 'desc']],
            });
            if (ret) {
                return ret;
            }
            return {
                msg: '????????????',
            };
        }
        return {
            msg: '????????????',
        };
    }
    // ?????????????????????
    async issueAdvance(id) {
        const { ctx, app } = this;
        const { role_id } = ctx.state.user;
        if (role_id >= 2) {
            const ret = await app.mysql.update('activity', {
                id,
                advance: 1,
            });
            if (ret.affectedRows === 1) {
                return {
                    id: parseInt(id),
                    msg: '????????????',
                };
            }
            return {
                msg: '????????????',
            };
        }
        return {
            msg: '????????????',
        };
    }
    // ??????????????????
    async getPersonActives(params) {
        let { user_id, room_id, type, current_page, page_size } = params;
        const start_num = (current_page - 1) * page_size;
        user_id = parseInt(user_id);
        room_id = parseInt(room_id);
        const { app } = this;
        let ret;
        if (type === 'done') {
            const sql = `
                select * from activity  where room_id=${room_id} and start_time<${Date.now()} and advance=1
                order by start_time desc
            `;
            ret = await app.mysql.query(sql);
        } else if (type === 'will') {
            const sql = `
            select * from activity where room_id=${room_id} and start_time>${Date.now()} and advance=1
            order by start_time desc
             `;
            ret = await app.mysql.query(sql);
        } else {
            return {
                msg: '????????????',
            };
        }
        if (ret) {
            const myArr = [];
            let record_files;
            ret.forEach((item, index) => {
                const num = index % 5;
                let join_users;
                try {
                    join_users = JSON.parse(item.join_users || '[]');
                } catch (error) {
                    join_users = [{ msg: '????????????' }];
                }

                const flag = join_users.some(users => users.user_id === user_id);
                flag && myArr.push(item);
                const myFile = [{ id: -1, filePath: `/public/swiper/${num + 1}.jpg` }];
                record_files = item.record_files ? JSON.parse(item.record_files) : myFile;
                record_files.forEach(fileItem => {
                    if (swiperWhitelist.some(whiteItem => whiteItem === path.extname(fileItem.filePath)) && myFile.length <= 1) {
                        myFile.push(fileItem);
                        return;
                    }
                });
                item.img = [myFile.pop()];
                delete item.record_files;

            });
            const tempArr = [];
            for (let i = start_num; i < start_num + page_size; i++) {
                if (myArr[i]) {
                    tempArr.push(myArr[i]);
                }
            }
            return { act: tempArr, length: myArr.length };
        }
        return {
            msg: '????????????',
        };

    }
    // ?????????????????????????????????????????????
    async getActivesByDay(time) {
        const startDate = new Date(parseInt(time));
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(parseInt(time));
        endDate.setHours(23, 59, 59, 999);
        const { app } = this;
        time = time || 1;
        const sql = `
            select
            activity.id as id,
            activity.title as title,
            FROM_UNIXTIME(activity.start_time/1000,'%Y-%m-%d %H:%i:%s') as start_time,
            FROM_UNIXTIME(activity.end_time/1000,'%Y-%m-%d %H:%i:%s') as end_time,
            user.name AS username,
            user.avatar as avatar,
            teach_room.name as room_name
            from activity 
            left join user on  user.id=activity.leader_id  
            left join teach_room on  activity.room_id=teach_room.id  
            where activity.start_time >= ${startDate.getTime()} and  activity.start_time <= ${endDate.getTime()} and advance=1
        `;
        const ret = await app.mysql.query(sql);
        if (ret) {
            return ret;
        }
        return {
            msg: '????????????',
        };
    }
}

module.exports = ActiveService;
