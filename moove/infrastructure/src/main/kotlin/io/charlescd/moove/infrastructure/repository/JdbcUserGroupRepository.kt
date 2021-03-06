/*
 *
 *  * Copyright 2020 ZUP IT SERVICOS EM TECNOLOGIA E INOVACAO SA
 *  *
 *  * Licensed under the Apache License, Version 2.0 (the "License");
 *  * you may not use this file except in compliance with the License.
 *  * You may obtain a copy of the License at
 *  *
 *  *     http://www.apache.org/licenses/LICENSE-2.0
 *  *
 *  * Unless required by applicable law or agreed to in writing, software
 *  * distributed under the License is distributed on an "AS IS" BASIS,
 *  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  * See the License for the specific language governing permissions and
 *  * limitations under the License.
 *
 */

package io.charlescd.moove.infrastructure.repository

import io.charlescd.moove.domain.*
import io.charlescd.moove.domain.repository.UserGroupRepository
import io.charlescd.moove.infrastructure.repository.mapper.UserGroupExtractor
import java.util.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcUserGroupRepository(
    private val jdbcTemplate: JdbcTemplate,
    private val userGroupExtractor: UserGroupExtractor
) : UserGroupRepository {

    companion object {
        const val BASE_QUERY_STATEMENT = """
            SELECT user_groups.id                 AS user_group_id,
                   user_groups.name               AS user_group_name,
                   user_groups.created_at         AS user_group_created_at,
                   user_groups_author.id          AS user_group_author_id,
                   user_groups_author.name        AS user_group_author_name,
                   user_groups_author.photo_url   AS user_group_author_photo_url,
                   user_groups_author.email       AS user_group_author_email,
                   user_groups_author.created_at  AS user_group_author_created_at,
                   user_groups_members.id         AS user_group_user_id,
                   user_groups_members.name       AS user_group_user_name,
                   user_groups_members.is_root    AS user_group_is_root,
                   user_groups_members.photo_url  AS user_group_user_photo_url,
                   user_groups_members.email      AS user_group_user_email,
                   user_groups_members.created_at AS user_group_user_created_at
            FROM user_groups
                     INNER JOIN users user_groups_author ON user_groups.user_id = user_groups_author.id
                     LEFT JOIN user_groups_users ON user_groups.id = user_groups_users.user_group_id
                     LEFT JOIN users AS user_groups_members ON user_groups_members.id = user_groups_users.user_id
            WHERE 1 = 1
        """
    }

    override fun save(userGroup: UserGroup): UserGroup {
        createUserGroup(userGroup)
        return findById(userGroup.id).get()
    }

    override fun update(userGroup: UserGroup): UserGroup {
        updateUserGroup(userGroup)
        return findById(userGroup.id).get()
    }

    override fun findById(id: String): Optional<UserGroup> {
        return findUserGroupById(id)
    }

    override fun find(name: String?, page: PageRequest): Page<UserGroup> {
        return findPage(name, page)
    }

    override fun delete(userGroup: UserGroup) {
        deleteMembersFromUserGroup(userGroup)
        deleteUserGroup(userGroup)
    }

    override fun addMember(userGroup: UserGroup, member: User) {
        addMemberToUserGroup(userGroup.id, member.id)
    }

    override fun removeMember(userGroup: UserGroup, member: User) {
        removeMemberFromUserGroup(userGroup.id, member.id)
    }

    private fun createUserGroup(userGroup: UserGroup) {
        val statement = "INSERT INTO user_groups(" +
                "id," +
                "name," +
                "user_id," +
                "created_at) " +
                "VALUES(?,?,?,?)"

        this.jdbcTemplate.update(
            statement,
            userGroup.id,
            userGroup.name,
            userGroup.author.id,
            userGroup.createdAt
        )
    }

    private fun updateUserGroup(userGroup: UserGroup) {
        val statement = "UPDATE user_groups SET name = ? WHERE id = ?"

        this.jdbcTemplate.update(
            statement,
            userGroup.name,
            userGroup.id
        )
    }

    private fun findUserGroupById(id: String): Optional<UserGroup> {
        val statement = StringBuilder(BASE_QUERY_STATEMENT)
            .appendln("AND user_groups.id = ?")

        return Optional.ofNullable(
            this.jdbcTemplate.query(statement.toString(), arrayOf(id), userGroupExtractor)?.firstOrNull()
        )
    }

    private fun findPage(name: String?, page: PageRequest): Page<UserGroup> {
        val result = executePageQuery(createPagedStatement(name, page), name)

        return Page(
            result?.toList() ?: emptyList(),
            page.page,
            page.size,
            executeCountQuery(name) ?: 0
        )
    }

    private fun getPagedInnerQueryStatement(name: String?, pageRequest: PageRequest): String {
        val innerQueryStatement = StringBuilder("SELECT * FROM user_groups WHERE 1 = 1")
        name?.let { innerQueryStatement.appendln("AND user_groups.name ILIKE ?") }
        return innerQueryStatement.appendln("ORDER BY user_groups.name ASC")
            .appendln("LIMIT ${pageRequest.size}")
            .appendln("OFFSET ${pageRequest.offset()}")
            .toString()
    }

    private fun executePageQuery(
        statement: String,
        name: String?
    ): Set<UserGroup>? {
        val parameters = mutableListOf<Any>()
        return appendParametersAndRunQuery(statement, parameters, name)
    }

    private fun appendParametersAndRunQuery(
        statement: String,
        parameters: MutableList<Any>,
        name: String?
    ): Set<UserGroup>? {
        name?.let { parameters.add("%$it%") }
        return this.jdbcTemplate.query(
            statement,
            parameters.toTypedArray(),
            userGroupExtractor
        )
    }

    private fun executeCountQuery(name: String?): Int? {
        val countStatement = StringBuilder(
            """
               SELECT count(*) AS total
               FROM user_groups
               WHERE 1 = 1
               """
        )

        val parameters = mutableListOf<String>()

        name?.let {
            parameters.add("%$it%")
            countStatement.appendln("AND user_groups.name ILIKE ?")
        }

        return this.jdbcTemplate.queryForObject(
            countStatement.toString(),
            parameters.toTypedArray()
        ) { resultSet, _ -> resultSet.getInt(1) }
    }

    private fun deleteMembersFromUserGroup(userGroup: UserGroup) {
        val statement = "DELETE FROM user_groups_users WHERE user_group_id = ?"
        this.jdbcTemplate.update(statement, userGroup.id)
    }

    private fun deleteUserGroup(userGroup: UserGroup) {
        val statement = "DELETE FROM user_groups WHERE id = ?"
        this.jdbcTemplate.update(statement, userGroup.id)
    }

    private fun addMemberToUserGroup(id: String, memberId: String) {
        val statement = "INSERT INTO user_groups_users VALUES (?, ?)"
        this.jdbcTemplate.update(statement, id, memberId)
    }

    private fun removeMemberFromUserGroup(id: String, memberId: String) {
        val statement = "DELETE FROM user_groups_users WHERE user_group_id = ? AND user_id = ?"
        this.jdbcTemplate.update(statement, id, memberId)
    }

    private fun createPagedStatement(name: String?, pageRequest: PageRequest): String {
        val innerQueryStatement = getPagedInnerQueryStatement(name, pageRequest)
        return """
                   SELECT user_groups.id          AS user_group_id,
                   user_groups.name               AS user_group_name,
                   user_groups.created_at         AS user_group_created_at,
                   user_groups_author.id          AS user_group_author_id,
                   user_groups_author.name        AS user_group_author_name,
                   user_groups_author.photo_url   AS user_group_author_photo_url,
                   user_groups_author.email       AS user_group_author_email,
                   user_groups_author.created_at  AS user_group_author_created_at,
                   user_groups_members.id         AS user_group_user_id,
                   user_groups_members.name       AS user_group_user_name,
                   user_groups_members.is_root    AS user_group_is_root,
                   user_groups_members.photo_url  AS user_group_user_photo_url,
                   user_groups_members.email      AS user_group_user_email,
                   user_groups_members.created_at AS user_group_user_created_at
            FROM ( $innerQueryStatement ) user_groups
                     INNER JOIN users user_groups_author ON user_groups.user_id = user_groups_author.id
                     LEFT JOIN user_groups_users ON user_groups.id = user_groups_users.user_group_id
                     LEFT JOIN users AS user_groups_members ON user_groups_members.id = user_groups_users.user_id
            WHERE 1 = 1
            ORDER BY user_groups.name ASC
        """
    }
}
