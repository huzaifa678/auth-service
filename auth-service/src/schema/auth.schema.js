import gql from "graphql-tag";

const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    createdAt: String!
    refreshTokens: [RefreshToken!]!
  }

  type RefreshToken {
    id: ID!
    token: String!
    expiresAt: String!
    createdAt: String!
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type Query {
    me: User
  }

  type Mutation {
    register(email: String!, password: String!): User!
    login(email: String!, password: String!): AuthPayload!
    refreshToken(token: String!): AuthPayload!
    logout(token: String!): Boolean!
  }
`;

export default typeDefs;